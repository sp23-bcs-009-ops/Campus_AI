"""
LangChain pipeline for Campus AI.

The old 1200-line /ask endpoint is refactored into:

    question ──► IntentRouter ──► one small handler per intent
                     │
                     ├─ greeting / small-talk ──► LLM chain (+ chat memory)
                     ├─ comsats_info ──────────► ChromaDB RAG chain (+ memory)
                     ├─ teacher ───────────────► deterministic timetable logic
                     ├─ room / rooms ──────────► deterministic timetable logic
                     ├─ timetable ─────────────► deterministic timetable logic
                     └─ off_topic ─────────────► polite refusal

Per-session memory does two jobs:
  1. Conversation window fed to the LLM chains (LangChain message history).
  2. Entity memory (last teacher/class/room) so follow-ups like
     "what about Tuesday?" resolve against the previous subject.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

import timetable_service as tt
from comsats_scraper import get_comsats_direct_answer, is_comsats_question
from config import settings
from llm import get_chat_model, get_fallback_chat_model
from rag_store import rag_store

# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Campus AI, a strict university campus assistant.
You MUST always respond in clear English only.

You ONLY help students with:
- Class schedules and timetables
- Teacher availability (free/busy slots)
- Room numbers and lecture times
- COMSATS University information from official COMSATS website data
- Greetings and polite small-talk (hello, how are you)

You must REFUSE any question that is not related to the university timetable system or COMSATS University.
This includes: general knowledge, animals, science, history, professor backgrounds/biographies, personal advice, coding help, or anything outside timetable scope.

When refusing, say something like:
"I'm only here to help with timetable, schedule, and COMSATS University questions! Try asking about your class schedule, a teacher's availability, or COMSATS campuses/admissions."

Be warm but firm. Never answer off-topic questions even if the user insists.
Remember: you are talking to university students. Stay on topic and always speak in English."""

COMSATS_PROMPT = """You answer COMSATS University questions using only official COMSATS website context.
Rules:
- Always respond in English.
- Do not start with "Welcome", "The student asks", or "You asked".
- Do not say "let me know" or add extra chatty endings.
- Do not guess facts that are not present in the context.
- If the context is incomplete, say exactly what is missing.
- Keep answers concise.
- Include the most relevant source URL."""

REFUSAL = (
    "🎓 I'm Campus AI — your university timetable assistant! "
    "I can only help with class schedules, teacher availability, room info, and COMSATS University information.\n\n"
    "Try asking something like:\n"
    "• 'What are BCS-I classes on Monday?'\n"
    "• 'Is Sir Kamran free on Friday?'\n"
    "• 'Show me BSSE-3 timetable for today'"
)


# ─────────────────────────────────────────────────────────────────────────────
# Session memory
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class SessionMemory:
    messages: List[BaseMessage] = field(default_factory=list)
    last_teacher: Optional[str] = None
    last_class: Optional[str] = None
    last_room: Optional[str] = None
    last_intent: Optional[str] = None

    def add_turn(self, question: str, answer: Any) -> None:
        self.messages.append(HumanMessage(content=question))
        text = answer if isinstance(answer, str) else "(structured timetable answer)"
        self.messages.append(AIMessage(content=text[:600]))
        # Keep a sliding window
        max_msgs = settings.memory_window * 2
        if len(self.messages) > max_msgs:
            self.messages = self.messages[-max_msgs:]


_SESSIONS: Dict[str, SessionMemory] = {}


def get_session(session_id: str) -> SessionMemory:
    if session_id not in _SESSIONS:
        # Naive eviction so memory can't grow forever
        if len(_SESSIONS) > 500:
            _SESSIONS.pop(next(iter(_SESSIONS)))
        _SESSIONS[session_id] = SessionMemory()
    return _SESSIONS[session_id]


# ─────────────────────────────────────────────────────────────────────────────
# LLM chains (LCEL)
# ─────────────────────────────────────────────────────────────────────────────

def _build_chain(system_prompt: str):
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}"),
        ]
    )
    llm = get_chat_model()
    chain = prompt | llm | StrOutputParser()
    fallback_llm = get_fallback_chat_model()
    if fallback_llm is not None:
        chain = chain.with_fallbacks([prompt | fallback_llm | StrOutputParser()])
    return chain


def _run_chain(system_prompt: str, user_input: str, memory: SessionMemory) -> str:
    chain = _build_chain(system_prompt)
    return chain.invoke({"input": user_input, "history": memory.messages})


# ─────────────────────────────────────────────────────────────────────────────
# Intent router
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RoutedQuestion:
    intent: str
    question: str
    cls: Optional[str] = None
    teacher: Optional[str] = None
    room: Optional[str] = None
    slot_filter: Any = None
    time_label: Optional[str] = None


ROOMS_ALL_PHRASES = [
    "all rooms", "available rooms", "rooms are free", "rooms are empty",
    "room availability", "room usage", "lecture theaters", "lecture theatres",
]


def route(question: str, memory: SessionMemory) -> RoutedQuestion:
    q_lower = question.lower()

    cls = tt.detect_class(question)
    teacher = tt.detect_teacher(question)
    room = tt.detect_room(question)
    slot_filter, time_label = tt._make_time_filter(question)

    # ── Follow-up resolution using entity memory ────────────────
    # "what about tuesday?" / "and on friday?" → reuse last entity
    is_bare_followup = (
        not cls and not teacher and not room
        and tt.detect_day(question)
        and len(question.split()) <= 6
    )
    if is_bare_followup:
        if memory.last_intent == "teacher" and memory.last_teacher:
            teacher = memory.last_teacher
        elif memory.last_intent == "room" and memory.last_room:
            room = memory.last_room
        elif memory.last_intent == "timetable" and memory.last_class:
            cls = memory.last_class

    base = dict(cls=cls, teacher=teacher, room=room,
                slot_filter=slot_filter, time_label=time_label)

    # Guard against fuzzy teacher false-positives:
    # "What are BCS-1 classes on Monday?" must stay a timetable question even
    # if the fuzzy matcher accidentally grabs a teacher name from stray words.
    explicit_teacher_signal = bool(
        tt.re.search(r"\b(sir|maam|madam|teacher|professor|faculty|instructor|dr|mr|ms|miss)\b", q_lower)
        or any(p in q_lower for p in ["who teaches", "which teacher", "all teachers", "teacher schedule"])
    )
    if teacher and cls and not explicit_teacher_signal:
        teacher = None
        base["teacher"] = None

    if is_comsats_question(question) and not cls and not room:
        return RoutedQuestion("comsats_info", question, **base)

    if tt.is_off_topic(question):
        return RoutedQuestion("off_topic", question, **base)

    if tt.is_teacher_intent(question, teacher):
        return RoutedQuestion("teacher", question, **base)

    if any(p in q_lower for p in ROOMS_ALL_PHRASES):
        return RoutedQuestion("rooms_all", question, **base)

    if room:
        return RoutedQuestion("room", question, **base)

    if tt.is_room_intent(question, room):
        return RoutedQuestion("room_unknown", question, **base)

    if not cls and any(k in q_lower for k in [
        "free", "available", "sir", "teacher", "professor", "dr", "mr", "ms", "miss"
    ]):
        return RoutedQuestion("teacher_secondary", question, **base)

    if tt.timetable_question(question):
        return RoutedQuestion("timetable", question, **base)

    return RoutedQuestion("general", question, **base)


# ─────────────────────────────────────────────────────────────────────────────
# Intent handlers
# ─────────────────────────────────────────────────────────────────────────────

def handle_comsats(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    direct = get_comsats_direct_answer(rq.question)
    if direct:
        return direct

    hits = rag_store.search(rq.question)
    if not hits:
        return (
            "I can answer COMSATS University questions, but my official website knowledge base is empty right now.\n\n"
            "Ask an admin to refresh it via: GET /comsats/refresh\n\n"
            "After that, ask me about COMSATS campuses, admissions, programs, research, or official news."
        )

    context = rag_store.build_context(hits)
    prompt = f"Question: {rq.question}\n\nOfficial COMSATS website context:\n{context}\n"
    try:
        return _run_chain(COMSATS_PROMPT, prompt, memory)
    except Exception:
        source_lines = [
            f"- {h['title']}: {h['text'][:280]}...\n  Source: {h['url']}"
            for h in hits[:3]
        ]
        return "Here is what I found in the official COMSATS website data:\n\n" + "\n".join(source_lines)


def handle_teacher(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    teacher, cls, slot_filter = rq.teacher, rq.cls, rq.slot_filter

    if teacher is None:
        ambiguous = tt.teacher_name_candidates(question)
        if len(ambiguous) > 1:
            return {
                "type": "teacher_ambiguous",
                "message": "I found more than one matching teacher. Please ask with the full name.",
                "matches": ambiguous,
            }

    if cls and ("all teachers" in q_lower or "teachers teaching" in q_lower):
        return {"type": "class_teachers", "class": cls, "teachers": tt.teachers_for_class(cls)}

    if "which teacher" in q_lower and ("free right now" in q_lower or "free now" in q_lower):
        return {"type": "teachers_free_now", **tt.get_teachers_free_now()}

    if "who teaches" in q_lower:
        results = tt.classes_for_subject(question)
        if results:
            return {"type": "subject_teachers", "matches": results}

    if not teacher:
        if "teacher schedule" in q_lower and tt.detect_day(question):
            text = "Please mention a teacher name, for example: 'Show schedule of Sir Kamran on Monday'."
        elif "now" in q_lower or "current" in q_lower or "who" in q_lower or "which" in q_lower:
            text = "There are many teachers in the timetable. Please ask by name so I can check exact free/busy slots.\n"
        else:
            text = "I couldn't find a teacher matching that name in the timetable.\n"
        sample = sorted(tt.ALL_TEACHERS)[:8]
        text += "\nExamples of valid names:\n" + ", ".join(sample)
        text += f"\n\nTry asking: 'Is {sample[0]} free on Monday?'"
        return text

    memory.last_teacher = teacher

    if "next class" in q_lower:
        return {"type": "teacher_next_class", "teacher": teacher,
                "class_info": tt.find_next_teacher_class(teacher)}

    days_list = tt.detect_day(question)
    asks_teaching = any(p in q_lower for p in [
        "classes does", "classes taken", "have classes", "does ", " teach", "teaches", "taken by"
    ])
    if asks_teaching:
        return {
            "type": "teacher_classes",
            "teacher": teacher,
            "classes": tt.get_teacher_classes(teacher, days_list or tt.WEEK_DAYS, slot_filter),
        }

    if not days_list:
        days_list = (
            tt.WEEK_DAYS
            if any(p in q_lower for p in ["week", "all classes", "schedule", "busy", "available", "free"])
            else [tt.today_name()]
        )

    avail = tt.get_teacher_availability(teacher, days_list)
    days_data = []
    for d, data in avail.items():
        busy_list = []
        for slot, infos in sorted(data["busy"].items(), key=lambda x: tt._slot_start_minutes(x[0])):
            if slot_filter and not slot_filter(slot):
                continue
            busy_list.append({
                "slot": slot,
                "classes": [i["class"] for i in infos],
                "subjects": [i.get("subject", "") for i in infos],
                "rooms": [i.get("room", "N/A") for i in infos],
            })
        free_slots = [s for s in data["free"] if not slot_filter or slot_filter(s)]
        days_data.append({"day": d, "free": free_slots, "busy": busy_list})

    return {"type": "teacher_availability", "teacher": teacher, "days": days_data}


def handle_rooms_all(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    days_list = tt.detect_day(question) or (
        [tt.today_name()] if "today" in q_lower or "now" in q_lower else tt.WEEK_DAYS
    )
    active_filter = rq.slot_filter or (lambda slot: True)
    want_busy = any(w in q_lower for w in ["schedule", "usage", "occupied", "busy"])
    rooms = tt.all_rooms_at(days_list, active_filter, want_free=not want_busy)
    if "lecture theater" in q_lower or "lecture theatre" in q_lower:
        rooms = [r for r in rooms if r["room"].startswith("LT ")]
    return {
        "type": "rooms_schedule" if want_busy else "rooms_free",
        "days": days_list,
        "rooms": rooms,
    }


def handle_room(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    room, slot_filter = rq.room, rq.slot_filter
    memory.last_room = room

    days_list = tt.detect_day(question)
    if not days_list:
        days_list = [tt.today_name()] if any(
            p in q_lower for p in ["today", "now", "right now"]
        ) else tt.WEEK_DAYS

    avail = tt.get_room_availability(room, days_list)
    days_data = []
    for d, data in avail.items():
        busy_list = []
        for slot, infos in sorted(data["busy"].items(), key=lambda x: tt._slot_start_minutes(x[0])):
            if slot_filter and not slot_filter(slot):
                continue
            busy_list.append({
                "slot": slot,
                "classes": [i["class"] for i in infos],
                "subjects": [i.get("subject", "") for i in infos],
                "teachers": [i.get("teacher", "N/A") for i in infos],
            })
        free_slots = [s for s in data["free"] if not slot_filter or slot_filter(s)]
        days_data.append({"day": d, "free": free_slots, "busy": busy_list})

    return {"type": "room_availability", "room": room, "days": days_data}


def handle_room_unknown(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    q_lower = rq.question.lower()
    cls = rq.cls
    if cls and ("which room" in q_lower or "room is used" in q_lower or "rooms used" in q_lower):
        rows = []
        for row in tt.get_class_week_schedule(cls):
            rows.append({
                "day": row["day"],
                "time": row["time"].split(" - ", 1)[-1],
                "room": row["room"],
                "subject": row["subject"],
                "teacher": row["teacher"],
            })
        return {"type": "class_rooms", "class": cls, "rooms": rows}

    sample_rooms = sorted(tt.ALL_ROOMS)[:12]
    return (
        "\U0001f3db\ufe0f I couldn't identify the room you're asking about.\n\n"
        "You can ask me about any of these rooms:\n"
        + ", ".join(sample_rooms)
        + "\n\nExamples:\n"
        "\u2022 'Is LT 4 free on Monday?'\n"
        "\u2022 'When is CR 2 free this week?'\n"
        "\u2022 'Show LH 1 schedule for Friday'"
    )


def handle_teacher_secondary(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    teacher = rq.teacher or tt.detect_teacher(question)

    if teacher:
        memory.last_teacher = teacher
        days_list = tt.detect_day(question) or [tt.today_name()]
        avail = tt.get_teacher_availability(teacher, days_list)
        text = f"\U0001f468\u200d\U0001f3eb {teacher}\n\n"
        for d, data in avail.items():
            text += f"\U0001f4c5 {d}\n"
            if data["free"]:
                text += "\U0001f7e2 Free: " + ", ".join(data["free"]) + "\n"
            else:
                text += "\U0001f7e2 Free: No free slots\n"
            if data["busy"]:
                busy_lines = [f"{time} ({info[0]['class']})" for time, info in data["busy"].items()]
                text += "\U0001f534 Busy: " + ", ".join(busy_lines) + "\n"
            else:
                text += "\U0001f534 Busy: No classes scheduled\n"
            text += "\n"
        return text.strip()

    if "now" in q_lower or "current" in q_lower or "who" in q_lower or "which" in q_lower:
        text = "There are many teachers available! To check someone's schedule, please ask by name.\n"
    else:
        text = "I couldn't find a teacher matching that name in the timetable.\n"
    sample = sorted(tt.ALL_TEACHERS)[:8]
    text += "\nHere are some examples of valid names you can check:\n"
    text += ", ".join(sample) + "..."
    text += f"\n\nTry asking: 'Is {sample[0]} free on Monday?'"
    return text


def handle_timetable(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    question, q_lower = rq.question, rq.question.lower()
    cls, slot_filter, time_label = rq.cls, rq.slot_filter, rq.time_label

    if not cls:
        return "Please mention your class name, for example: BCS-I, BA-II, CS-III, CE-IV etc."

    memory.last_class = cls

    if "next class" in q_lower:
        return {"type": "next_class", "class": cls, "class_info": tt.find_next_class(cls)}

    days_list = tt.detect_day(question)
    if not days_list:
        if tt.wants_full_week(question) or (
            slot_filter and not any(p in q_lower for p in ["today", "tomorrow", "right now", "now", "current"])
        ):
            days_list = tt.WEEK_DAYS
        else:
            days_list = [tt.today_name()]

    aggregated = []
    for d in days_list:
        sched = tt.get_schedule(cls, d, slot_filter)
        if sched:
            aggregated.extend(sched)

    if aggregated:
        if len(days_list) == 6:
            display_day = "the Whole Week"
        elif len(days_list) > 1:
            display_day = ", ".join(days_list[:-1]) + f" & {days_list[-1]}"
        else:
            display_day = days_list[0]
        return {"type": "schedule", "class": cls, "day": display_day, "classes": aggregated}

    display_day = "the requested days" if len(days_list) > 1 else days_list[0]
    suffix = f" {time_label}" if time_label else ""
    return f"{cls} has no classes on {display_day}{suffix}."


def handle_general(rq: RoutedQuestion, memory: SessionMemory) -> Any:
    try:
        return _run_chain(SYSTEM_PROMPT, rq.question, memory)
    except Exception as e:
        return f"⚠️ AI service temporarily unavailable. Error: {str(e)[:50]}"


HANDLERS = {
    "comsats_info": handle_comsats,
    "off_topic": lambda rq, mem: REFUSAL,
    "teacher": handle_teacher,
    "rooms_all": handle_rooms_all,
    "room": handle_room,
    "room_unknown": handle_room_unknown,
    "teacher_secondary": handle_teacher_secondary,
    "timetable": handle_timetable,
    "general": handle_general,
}

# Which intents update entity memory's "last_intent"
_ENTITY_INTENTS = {"teacher", "teacher_secondary", "room", "timetable"}


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def answer_question(question: str, session_id: str = "default") -> Dict[str, Any]:
    memory = get_session(session_id)
    rq = route(question, memory)
    handler = HANDLERS[rq.intent]
    result = handler(rq, memory)

    if rq.intent in _ENTITY_INTENTS:
        memory.last_intent = "teacher" if rq.intent == "teacher_secondary" else rq.intent
    memory.add_turn(question, result)

    return {"answer": result, "intent": rq.intent}
