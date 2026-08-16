import json
import datetime
import re
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from pydantic import BaseModel
from rapidfuzz import process
from ollama import chat
import time
from normalizer import extract_class_from_sentence, normalize_to_key
from comsats_scraper import (
    build_comsats_context,
    get_comsats_direct_answer,
    is_comsats_question,
    load_comsats_knowledge,
    refresh_comsats_knowledge,
    search_comsats_knowledge,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load timetable
with open("timetable_data.json", "r", encoding="utf-8") as f:
    TIMETABLE = json.load(f)

# Extract all unique teachers and standard time slots on startup
ALL_TEACHERS = set()
ALL_SLOTS = set()

for class_data in TIMETABLE.values():
    for day_schedule in class_data.values():
        for slot, classes in day_schedule.items():
            ALL_SLOTS.add(slot)
            for c in classes:
                t = c.get("teacher", "").strip()
                if t and t != "N/A" and t.lower() != "staff":
                    ALL_TEACHERS.add(t)

# Sort slots logically (assuming "H:MM-H:MM" format)
def _parse_time(t_str):
    try: return int(t_str.split(':')[0])
    except: return 0
ALL_SLOTS_SORTED = sorted(list(ALL_SLOTS), key=_parse_time)

# ── Build a room index: room -> {day -> {slot -> [class_name, ...]}} ──────
ALL_ROOMS = set()
_ROOM_INDEX = {}  # room -> day -> slot -> [cls, ...]

for cls_name, class_data in TIMETABLE.items():
    for day_name_key, day_schedule in class_data.items():
        for slot, entries in day_schedule.items():
            for entry in entries:
                room = entry.get("room", "").strip()
                if room:
                    ALL_ROOMS.add(room)
                    if room not in _ROOM_INDEX:
                        _ROOM_INDEX[room] = {}
                    if day_name_key not in _ROOM_INDEX[room]:
                        _ROOM_INDEX[room][day_name_key] = {}
                    if slot not in _ROOM_INDEX[room][day_name_key]:
                        _ROOM_INDEX[room][day_name_key][slot] = []
                    _ROOM_INDEX[room][day_name_key][slot].append({
                        "class": cls_name,
                        "subject": entry.get("subject", "N/A"),
                        "teacher": entry.get("teacher", "N/A"),
                    })


# Response cache to avoid redundant AI calls
response_cache = {}

class Query(BaseModel):
    question: str


class StudentTimetableRequest(BaseModel):
    class_name: str  # e.g., "CS-I", "BS-II", "BA-I"


# -------------------------
# System Prompt
# -------------------------

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


# -------------------------
# Helper Functions
# -------------------------

# Map full day names and abbreviations to timetable keys (Monday, Tuesday, etc.)
DAY_MAP = {
    "monday": "Monday",
    "mon": "Monday",
    "tuesday": "Tuesday",
    "tue": "Tuesday",
    "wednesday": "Wednesday",
    "wed": "Wednesday",
    "thursday": "Thursday",
    "thu": "Thursday",
    "friday": "Friday",
    "fri": "Friday",
    "saturday": "Saturday",
    "sat": "Saturday",
}

WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

def _words(text: str):
    return re.findall(r"[a-z0-9]+", (text or "").lower())

def _has_word(text: str, *needles: str) -> bool:
    word_set = set(_words(text))
    return any(n.lower() in word_set for n in needles)

def _has_phrase(text: str, phrase: str) -> bool:
    return phrase.lower() in (text or "").lower()

def _slot_start_minutes(slot: str) -> int:
    return _time_to_minutes((slot or "").split("-", 1)[0])

def _time_to_minutes(raw: str) -> int:
    raw = (raw or "").strip().lower().replace(".", "")
    match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", raw)
    if not match:
        return -1
    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    suffix = match.group(3)
    if suffix == "pm" and hour != 12:
        hour += 12
    elif suffix == "am" and hour == 12:
        hour = 0
    elif not suffix and hour <= 7:
        hour += 12
    return hour * 60 + minute

def _slot_contains(slot: str, minute: int) -> bool:
    try:
        start, end = slot.split("-", 1)
    except ValueError:
        return False
    start_m = _time_to_minutes(start)
    end_m = _time_to_minutes(end)
    return start_m <= minute < end_m

def _current_minutes() -> int:
    now = datetime.datetime.now()
    return now.hour * 60 + now.minute

def _make_time_filter(question: str):
    q = (question or "").lower()

    if "right now" in q or " now" in q or "current" in q:
        minute = _current_minutes()
        return lambda slot: _slot_contains(slot, minute), "right now"

    if "morning" in q:
        return lambda slot: _slot_start_minutes(slot) < 12 * 60, "in the morning"

    if "evening" in q or "afternoon" in q:
        return lambda slot: _slot_start_minutes(slot) >= 12 * 60, "after 12 PM"

    between = re.search(r"\bbetween\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:and|to|-)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", q)
    if between:
        start_m = _time_to_minutes(between.group(1))
        end_m = _time_to_minutes(between.group(2))
        return lambda slot: start_m <= _slot_start_minutes(slot) < end_m, f"between {between.group(1).strip()} and {between.group(2).strip()}"

    after = re.search(r"\bafter\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", q)
    if after:
        start_m = _time_to_minutes(after.group(1))
        return lambda slot: _slot_start_minutes(slot) >= start_m, f"after {after.group(1).strip()}"

    at = re.search(r"\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", q)
    if at:
        minute = _time_to_minutes(at.group(1))
        return lambda slot: _slot_contains(slot, minute), f"at {at.group(1).strip()}"

    return None, None

def _sort_by_slot(items):
    return sorted(items, key=lambda x: (_slot_start_minutes(x.get("time") or x.get("lecture") or x.get("slot") or ""), x.get("subject", "")))

def today_name():
    """Returns today's day as a timetable key e.g. Monday, Tuesday"""
    full = datetime.datetime.today().strftime("%A").lower()
    return DAY_MAP.get(full, "Monday")


def detect_teacher(question):
    """Detects a specific teacher name from the user question, handling typos and partial names."""
    from rapidfuzz import fuzz
    import re

    q_lower = question.lower()
    # 0. Pre-normalize: handle contractions/possessives and alternate spellings
    q_lower = re.sub(r"ma'am", 'maam', q_lower)   # ma'am -> maam
    q_lower = re.sub(r"'s\b", '', q_lower)         # possessive: Haidar's -> Haidar

    # 1. Remove noise: titles, days, question words, and timetable jargon
    # Include common misspellings of days so they don't pollute teacher matching
    noise_pattern = (
        r'\b(is|when|who|what|where|sir|maam|miss|mr\.?|ms\.?|dr\.?|free|on|'
        r'monday|tuesday|wednesday|thursday|friday|saturday|sunday|'
        r'mondy|monady|munday|tuseday|tusday|wensday|wenesday|'
        r'thrusday|thursdai|firday|'
        r'today|tomorrow|available|schedule|timetable|time|of|the|for|now|'
        r'current|tell|me|professor|prof|visiting|teach|teaches|teaching|'
        r'have|has|class|classes|between|and|at|am|pm|afternoon|morning|'
        r'evening|week|whole|show|does|o|clock|oclock|period|meeting|busy|'
        r'slot|slots|lecture|lab|room|building|floor)\b'
    )
    clean_q = re.sub(noise_pattern, ' ', q_lower).strip()
    clean_q = re.sub(r'\b\d+\b', ' ', clean_q)       # strip bare numbers (2, 11, 3)
    clean_q = re.sub(r'[^\w\s]', ' ', clean_q)
    clean_q = re.sub(r'\s+', ' ', clean_q).strip()

    if not clean_q or len(clean_q) < 3:
        return None

    query_words = [w for w in clean_q.split() if len(w) >= 3]
    if not query_words:
        return None

    best_match = None
    best_score = 0

    for t in sorted(ALL_TEACHERS):
        # Clean teacher name of titles/noise for comparison
        t_clean = re.sub(r'\b(sir|maam|miss|mr\.?|ms\.?|dr\.?|professor|prof|visiting)\b', ' ', t.lower())
        t_clean = re.sub(r'[^\w\s]', ' ', t_clean)
        t_clean = re.sub(r'\s+', ' ', t_clean).strip()
        teacher_words = [w for w in t_clean.split() if len(w) >= 3]

        if not teacher_words:
            continue

        # ── Metric A: base fuzzy token-set ratio ───────────────────────────
        score = fuzz.token_set_ratio(clean_q, t_clean)

        # ── Metric B: per-word fuzzy matching (handles typos in each word) ─
        matched_query_words = 0
        total_word_score = 0
        for qw in query_words:
            best_word_score = max(
                (fuzz.ratio(qw, tw) for tw in teacher_words),
                default=0
            )
            if best_word_score >= 70:  # 70% catches more extreme typos
                matched_query_words += 1
                total_word_score += best_word_score

        if matched_query_words > 0:
            avg_word_score = total_word_score / matched_query_words
            word_bonus = (matched_query_words * 25) + (avg_word_score * 0.3)
            score = max(score, word_bonus)

            # ── Metric C: penalise unmatched teacher-name words ──────────
            # Prevents "Dr. Ali Imran" beating "Mr. Imran Bashir" when
            # query contains "bashir" (ali has no match in query).
            unmatched_teacher_words = 0
            for tw in teacher_words:
                best_q = max((fuzz.ratio(tw, qw) for qw in query_words), default=0)
                if best_q < 70:
                    unmatched_teacher_words += 1
            score = max(0, score - unmatched_teacher_words * 8)

        # ── Metric D: exact substring in cleaned name ───────────────────
        if len(clean_q) >= 4 and clean_q in t_clean:
            score = max(score, 92)

        if score > best_score:
            best_score = score
            best_match = t

    if best_score >= 58:
        return best_match

    return None


def teacher_name_candidates(question):
    """
    Return possible teachers when a short titled name is ambiguous.
    Extracts ALL name tokens after the title so that a full name like
    'Mr. Usman Anwar' narrows down to exactly one candidate (not ambiguous).
    """
    q_lower = question.lower()

    # Match title followed by one or more name words
    # e.g. "Mr. Usman Anwar" → title="mr", rest="usman anwar"
    title_match = re.search(
        r"\b(dr|sir|mr|ms|miss|maam|madam)\.?\s+([a-z][a-z\s]*)",
        q_lower
    )
    if not title_match:
        return []

    title = title_match.group(1)
    # Extract individual name tokens (skip noise / stop words)
    raw_name_part = title_match.group(2)
    # Stop at common sentence words that aren't names
    stop_words = {"free", "on", "is", "when", "what", "does", "have", "classes",
                  "schedule", "timetable", "available", "today", "monday", "tuesday",
                  "wednesday", "thursday", "friday", "saturday", "sunday", "the", "of",
                  "for", "whole", "week", "tell", "me", "show", "time"}
    name_tokens = []
    for w in re.findall(r"[a-z]+", raw_name_part):
        if w in stop_words:
            break  # stop as soon as we hit a non-name word
        if len(w) >= 2:
            name_tokens.append(w)

    if not name_tokens or len(name_tokens[0]) < 3:
        return []

    candidates = []
    for teacher in sorted(ALL_TEACHERS):
        t_lower = teacher.lower()
        t_clean = re.sub(r"\b(dr|sir|mr|ms|miss|maam|madam)\.?\b", " ", t_lower)
        words = set(re.findall(r"[a-z]+", t_clean))

        # ALL extracted name tokens must appear in the teacher's name
        if not all(tok in words for tok in name_tokens):
            continue
        if title == "dr" and not t_lower.startswith("dr"):
            continue
        if title in {"mr", "sir"} and t_lower.startswith(("ms", "miss")):
            continue
        candidates.append(teacher)

    return candidates


def get_teacher_availability(teacher, days):
    """Returns the free and busy slots for a teacher on specific days."""
    result = {}
    for d in days:
        busy_slots = {}  # slot -> [{"class": cls, "room": room}]
        
        # Scan the whole timetable for this day
        for cls, class_data in TIMETABLE.items():
            day_data = class_data.get(d, {})
            for slot, entries in day_data.items():
                for entry in entries:
                    if entry.get("teacher") == teacher:
                        if slot not in busy_slots:
                            busy_slots[slot] = []
                        busy_slots[slot].append({"class": cls, "room": entry.get("room", "N/A"), "subject": entry.get("subject", "")})
        
        # Find free slots by taking all slots and removing busy ones
        free_slots = [s for s in ALL_SLOTS_SORTED if s not in busy_slots]
        
        result[d] = {
            "busy": busy_slots,
            "free": free_slots
        }
        
    return result


def get_teacher_classes(teacher, days=None, slot_filter=None):
    days = days or WEEK_DAYS
    rows = []
    for day, data in get_teacher_availability(teacher, days).items():
        for slot, infos in data["busy"].items():
            if slot_filter and not slot_filter(slot):
                continue
            for info in infos:
                rows.append({
                    "day": day,
                    "time": slot,
                    "class": info.get("class", "N/A"),
                    "subject": info.get("subject", ""),
                    "room": info.get("room", "N/A"),
                })
    return _sort_by_slot(rows)


def get_teachers_free_now():
    day = today_name()
    minute = _current_minutes()
    matching_slot = next((slot for slot in ALL_SLOTS_SORTED if _slot_contains(slot, minute)), None)
    if not matching_slot:
        return {"day": day, "slot": None, "teachers": []}

    free = []
    for teacher in sorted(ALL_TEACHERS):
        busy = get_teacher_availability(teacher, [day])[day]["busy"]
        if matching_slot not in busy:
            free.append(teacher)
    return {"day": day, "slot": matching_slot, "teachers": free}

def get_room_availability(room, days):
    """Returns busy and free slots for a room across given days."""
    result = {}
    room_data = _ROOM_INDEX.get(room, {})
    for d in days:
        day_data = room_data.get(d, {})
        busy = {slot: info for slot, info in day_data.items()}
        free = [s for s in ALL_SLOTS_SORTED if s not in busy]
        result[d] = {"busy": busy, "free": free}
    return result


def normalize_room(token: str) -> str:
    """
    Normalise a raw user token to match canonical room names.
    Handles: lt4, LT-4, lt 4, lecture theater 4, cr4, CR-4,
             lh4, LH 4, cs lab 1, cs c.lab 1, cs c lab 1 etc.
    """
    import re
    t = token.strip().lower()
    t = re.sub(r'[\-_]', ' ', t)           # LT-4 -> lt 4
    t = re.sub(r'[^a-z0-9 ]', ' ', t)     # remove dots etc
    t = re.sub(r'\s+', ' ', t).strip()

    # Alias expansions
    aliases = [
        (r'\blecture hall\b',      'lh'),
        (r'\blecture theater\b',   'lt'),
        (r'\blecture theatre\b',   'lt'),
        (r'\bclass room\b',        'cr'),
        (r'\bclassroom\b',         'cr'),
        (r'\bconf room\b',         'cr'),
        (r'\bcomputer lab\b',      'cs c lab'),
        (r'\bcs lab\b',            'cs c lab'),
    ]
    for pattern, repl in aliases:
        t = re.sub(pattern, repl, t)

    # Compact form: "lt4" -> "lt 4", "cr4" -> "cr 4"
    t = re.sub(r'\b(lt|lh|cr)(\d)', r'\1 \2', t)
    # cs c lab4 -> cs c lab 4
    t = re.sub(r'(lab)(\d)', r'\1 \2', t)

    return t.strip()


def detect_room(question: str):
    """
    Find which canonical room the user is asking about.
    Returns the exact room string from ALL_ROOMS, or None.
    """
    from rapidfuzz import fuzz
    import re

    # Build a normalised -> canonical map once
    norm_map = {normalize_room(r): r for r in ALL_ROOMS}

    # Tokenise the question aggressively so "is lt4 free" -> tokens include "lt4"
    # We try all contiguous n-grams (1..4 words) to catch "cs c lab 1"
    words = re.findall(r'[a-z0-9]+', question.lower())
    candidates = []
    for size in range(1, 5):
        for i in range(len(words) - size + 1):
            candidates.append(' '.join(words[i:i+size]))

    best_room = None
    best_score = 0
    for cand in candidates:
        norm_cand = normalize_room(cand)
        if not norm_cand:
            continue
        for norm_r, canon_r in norm_map.items():
            # Exact match on normalised forms
            if norm_cand == norm_r:
                return canon_r
            # Fuzzy fallback
            score = fuzz.ratio(norm_cand, norm_r)
            if score > best_score and score >= 80:
                best_score = score
                best_room = canon_r

    return best_room

def detect_class(question):
    """
    Detect class name from question.
    Priority:
      1. extract_class_from_sentence()  — handles ALL input variants
         (BCS1, BSCS I, BCSsem1, SE semester 7, AI-II, ...)
      2. Direct substring match against known keys
      3. RapidFuzz fuzzy match as last resort
    """
    classes = list(TIMETABLE.keys())


    # ── 1. Normalizer (primary) ──────────────────────────────────
    result = extract_class_from_sentence(question, classes)
    if result:
        return result

    # ── 2. Exact substring match (case-insensitive) ─────────────
    q_upper = question.upper()
    for cls in classes:
        if cls.upper() in q_upper:
            return cls

    # ── 3. Fuzzy match fallback ──────────────────────────────────
    match = process.extractOne(q_upper, [c.upper() for c in classes], score_cutoff=55)
    if match:
        for cls in classes:
            if cls.upper() == match[0]:
                return cls

    return None


def detect_day(question):
    """Detect all days requested in the question, returning a list of canonical day names."""
    q_lower = question.lower()
    
    # 1. Check for whole week requests
    if any(phrase in q_lower for phrase in ["whole week", "all week", "entire week", "week", "all days"]):
        return WEEK_DAYS
        
    # 2. Check for specific days
    found_days = []
    seen = set()
    
    import re
    words = re.findall(r'\b[a-z]+\b', q_lower)
    for w in words:
        if w in DAY_MAP:
            day_full = DAY_MAP[w]
            if day_full not in seen:
                found_days.append(day_full)
                seen.add(day_full)
                
    if found_days:
        return found_days

    if "today" in q_lower:
        return [today_name()]
        
    if "tomorrow" in q_lower:
        days_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        idx = days_order.index(today_name())
        # If today is Saturday or Sunday, tomorrow's classes are on Monday
        next_day = "Monday" if idx >= 5 else days_order[idx + 1]
        return [next_day]

    return None


def wants_full_week(question: str) -> bool:
    q = (question or "").lower()
    if any(p in q for p in ["full week", "whole week", "all week", "entire week", "all days"]):
        return True
    if any(p in q for p in ["full timetable", "complete schedule", "complete timetable"]):
        return True
    if "timetable" in q and not detect_day(question):
        return True
    if "schedule" in q and not detect_day(question) and not _make_time_filter(question)[0]:
        return True
    return False


def is_teacher_intent(question: str, teacher=None) -> bool:
    q = (question or "").lower()
    if teacher:
        return True
    if re.search(r"\b(sir|maam|madam|teacher|professor|faculty|instructor|dr|mr|ms|miss)\b", q):
        return True
    if any(p in q for p in ["who teaches", "which teacher", "all teachers", "teacher schedule"]):
        return True
    return False


def is_room_intent(question: str, room=None) -> bool:
    q = (question or "").lower()
    if room:
        return True
    room_patterns = [
        r"\b(lt|lh|cr)\s*-?\s*\d+\b",
        r"\blecture\s+(theater|theatre|hall)\s*\d+\b",
        r"\bclass\s*room\s*\d+\b",
        r"\bcs\s*(c\s*)?lab\s*\d+\b",
        r"\b(room|rooms|lab|labs|lecture theaters|lecture theatres)\b",
    ]
    return any(re.search(pattern, q) for pattern in room_patterns)


def timetable_question(text):
    """Detect if question is about timetable with typo tolerance"""
    keywords = [
        "class", "lecture", "room", "teacher",
        "today", "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday",
        "mon", "tue", "wed", "thu", "fri", "sat",
        "schedule", "shedule",  # Handle typo
        "time", "subject", "timetable",
        "have", "when", "what", "show",
    ]

    t = text.lower()
    # Check for timetable keywords
    has_keyword = any(k in t for k in keywords)

    # Check if it contains a recognizable class reference
    # (normalizer returns a key if it can find a class in the text)
    classes = list(TIMETABLE.keys())
    has_class = extract_class_from_sentence(text, classes) is not None

    return has_keyword or has_class


# Off-topic keywords that have nothing to do with a university timetable
_OFF_TOPIC_KEYWORDS = [
    # Animals / nature
    "cat", "dog", "animal", "bird", "fish", "lion", "tiger", "elephant",
    "snake", "horse", "cow", "pet", "wildlife", "zoo",
    # General knowledge / science
    "history", "geography", "physics", "chemistry", "biology", "math",
    "capital of", "who invented", "what is a", "tell me about",
    "explain", "define", "meaning of", "difference between",
    # Professor personal background
    "biography", "background", "personal life", "family", "wife", "husband",
    "born", "age of", "nationality", "hometown", "qualification", "degree of",
    "phd", "education of", "experience of",
    # Tech / coding help
    "code", "python", "javascript", "html", "css", "programming",
    "algorithm", "bug", "error", "function", "variable",
    # Other unrelated
    "movie", "song", "music", "game", "sport", "cricket", "football",
    "weather", "news", "politics", "religion", "cook", "recipe",
    "joke", "story", "write a poem", "translate",
]

# Greetings that are always allowed
_GREETINGS = [
    "hello", "hi", "hey", "how are you", "good morning",
    "good afternoon", "good evening", "thanks", "thank you",
    "assalam", "salam", "bye", "goodbye",
]

def is_off_topic(text: str) -> bool:
    """
    Returns True if the question is clearly unrelated to the university timetable.
    Greetings are always allowed. Teacher availability & schedule questions are allowed.
    """
    t = text.lower().strip()

    # Always allow greetings
    if any(g in t for g in _GREETINGS):
        return False

    # Official COMSATS University questions are on-topic.
    if is_comsats_question(text):
        return False

    # If it's a timetable question or teacher query, it's on-topic
    if timetable_question(text) or is_teacher_intent(text):
        return False

    # Check for off-topic keywords
    if any(kw in t for kw in _OFF_TOPIC_KEYWORDS):
        return True

    return False


def get_schedule(cls, day, slot_filter=None):
    """Returns structured JSON array of classes for a given day"""
    if cls not in TIMETABLE:
        return None

    data = TIMETABLE[cls]
    if day not in data:
        return None

    classes = []
    for lecture, entries in data[day].items():
        if slot_filter and not slot_filter(lecture):
            continue
        for info in entries:
            classes.append({
                "subject": info.get("subject", "N/A"),
                "teacher": info.get("teacher", "N/A"),
                "room": info.get("room", ""),
                "time": lecture,
                "day": day
            })

    return _sort_by_slot(classes) if classes else None


def get_class_week_schedule(cls, slot_filter=None):
    classes = []
    for day in WEEK_DAYS:
        for row in get_schedule(cls, day, slot_filter) or []:
            item = dict(row)
            item["time"] = f"{day} - {item['time']}"
            item["day"] = day
            classes.append(item)
    return classes


def find_next_class(cls):
    if cls not in TIMETABLE:
        return None
    today = today_name()
    now_minutes = _current_minutes()
    ordered = WEEK_DAYS
    start_index = ordered.index(today) if today in ordered else 0
    for offset in range(len(ordered)):
        day = ordered[(start_index + offset) % len(ordered)]
        for row in get_schedule(cls, day) or []:
            start = _slot_start_minutes(row["time"])
            if offset > 0 or start >= now_minutes:
                item = dict(row)
                item["day"] = day
                return item
    return None


def find_next_teacher_class(teacher):
    today = today_name()
    now_minutes = _current_minutes()
    start_index = WEEK_DAYS.index(today) if today in WEEK_DAYS else 0
    for offset in range(len(WEEK_DAYS)):
        day = WEEK_DAYS[(start_index + offset) % len(WEEK_DAYS)]
        busy = get_teacher_availability(teacher, [day])[day]["busy"]
        for slot in sorted(busy, key=_slot_start_minutes):
            if offset > 0 or _slot_start_minutes(slot) >= now_minutes:
                return {"day": day, "slot": slot, "classes": busy[slot]}
    return None


def classes_for_subject(subject_query: str):
    q = re.sub(r"\b(who|teaches|teacher|for|of|the|subject|course|is)\b", " ", subject_query.lower())
    q = re.sub(r"[^a-z0-9 ]", " ", q)
    q = re.sub(r"\s+", " ", q).strip()
    terms = [term for term in q.split() if len(term) > 2]
    results = []
    seen = set()
    for cls, class_data in TIMETABLE.items():
        for day, day_data in class_data.items():
            for slot, entries in day_data.items():
                for info in entries:
                    subject = info.get("subject", "")
                    haystack = subject.lower()
                    is_match = False
                    if terms and all(term in haystack for term in terms):
                        is_match = True
                    elif q and len(terms) == 1 and process.extractOne(q, [haystack], score_cutoff=88):
                        is_match = True
                    if is_match:
                        key = (subject, info.get("teacher", ""), cls, day, slot)
                        if key not in seen:
                            seen.add(key)
                            results.append({
                                "subject": subject,
                                "teacher": info.get("teacher", "N/A"),
                                "class": cls,
                                "day": day,
                                "time": slot,
                                "room": info.get("room", "N/A"),
                            })
    return _sort_by_slot(results)


def teachers_for_class(cls):
    teachers = []
    seen = set()
    for day in WEEK_DAYS:
        for row in get_schedule(cls, day) or []:
            key = (row["teacher"], row["subject"])
            if row["teacher"] and row["teacher"] != "N/A" and key not in seen:
                seen.add(key)
                teachers.append({
                    "teacher": row["teacher"],
                    "subject": row["subject"],
                    "day": day,
                    "time": row["time"],
                    "room": row["room"],
                })
    return teachers


def all_rooms_at(days, slot_filter, want_free=True):
    rows = []
    for room in sorted(ALL_ROOMS):
        availability = get_room_availability(room, days)
        for day, data in availability.items():
            busy_slots = [slot for slot in data["busy"] if not slot_filter or slot_filter(slot)]
            matching_slots = [slot for slot in ALL_SLOTS_SORTED if not slot_filter or slot_filter(slot)]
            if want_free:
                free_slots = [slot for slot in matching_slots if slot not in data["busy"]]
                if free_slots:
                    rows.append({"room": room, "day": day, "free": free_slots})
            elif busy_slots:
                rows.append({
                    "room": room,
                    "day": day,
                    "busy": [
                        {
                            "slot": slot,
                            "classes": [i["class"] for i in data["busy"][slot]],
                            "subjects": [i.get("subject", "") for i in data["busy"][slot]],
                            "teachers": [i.get("teacher", "N/A") for i in data["busy"][slot]],
                        }
                        for slot in sorted(busy_slots, key=_slot_start_minutes)
                    ],
                })
    return rows


# -------------------------
# Main Routes
# -------------------------

@app.post("/student-timetable")
def get_student_timetable(req: StudentTimetableRequest):
    """
    Get full timetable for a student's class
    Input: {"class_name": "CS-I"}
    Output: Complete timetable for that class from timetable_data.json
    """
    class_name = req.class_name.upper()
    
    # Normalize class name (handle aliases like BCS → CS)
    aliases = {'BCS': 'CS', 'BSE': 'BS'}
    for alias, actual in aliases.items():
        class_name = class_name.replace(alias, actual)
    
    # Check if class exists in timetable
    if class_name not in TIMETABLE:
        # Try exact match
        for cls in TIMETABLE.keys():
            if cls.upper() == class_name:
                class_name = cls
                break
        else:
            return {
                "success": False,
                "error": f"Class '{req.class_name}' not found in timetable",
                "available_classes": sorted(TIMETABLE.keys())
            }
    
    # Get timetable data
    timetable_data = TIMETABLE[class_name]
    
    # Format response: organize by day
    formatted_timetable = {
        "class": class_name,
        "schedule_by_day": {}
    }
    
    # Collect all lectures for each day
    for day, slots in timetable_data.items():
        formatted_timetable["schedule_by_day"][day] = []
        for lecture_slot, entries in slots.items():
            for class_info in entries:
                formatted_timetable["schedule_by_day"][day].append({
                    "lecture": lecture_slot,
                    "subject": class_info.get("subject", "N/A"),
                    "teacher": class_info.get("teacher", "N/A"),
                    "room": class_info.get("room", "N/A")
                })
    
    # Sort lectures by time within each day
    for day in formatted_timetable["schedule_by_day"]:
        formatted_timetable["schedule_by_day"][day].sort(
            key=lambda x: x["lecture"]
        )
    
    return {
        "success": True,
        "data": formatted_timetable
    }


@app.get("/today-classes/{class_name}")
def get_today_classes(class_name: str):
    """
    Get today's classes for a student's class
    Input: /today-classes/CS-I
    Output: All classes scheduled for today (Monday, Tuesday, etc.)
    """
    class_name = class_name.upper()
    
    # Normalize class name
    aliases = {'BCS': 'CS', 'BSE': 'BS'}
    for alias, actual in aliases.items():
        class_name = class_name.replace(alias, actual)
    
    # Find correct case for class name
    actual_class = None
    for cls in TIMETABLE.keys():
        if cls.upper() == class_name:
            actual_class = cls
            break
    
    if not actual_class:
        return {
            "success": False,
            "error": f"Class '{class_name}' not found",
            "available_classes": sorted(TIMETABLE.keys())
        }
    
    # Get today's day
    today_day = today_name()
    
    # Get all lectures for today
    timetable_data = TIMETABLE[actual_class]
    today_classes = []
    
    for lecture_slot, entries in timetable_data.get(today_day, {}).items():
        for class_info in entries:
            today_classes.append({
                "lecture": lecture_slot,
                "subject": class_info.get("subject", "N/A"),
                "teacher": class_info.get("teacher", "N/A"),
                "room": class_info.get("room", "N/A")
            })
    
    # Sort by time
    today_classes.sort(key=lambda x: x["lecture"])
    
    return {
        "success": True,
        "class": actual_class,
        "day": today_day,
        "day_name": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].index(today_day) + 1] if today_day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] else today_day,
        "classes": today_classes
    }


@app.get("/class-schedule/{class_name}/{day}")
def get_class_schedule_by_day(class_name: str, day: str):
    """
    Get schedule for a specific class on a specific day
    Input: /class-schedule/CS-I/Mon
    Output: All classes for that day
    """
    class_name = class_name.upper()
    day = day.title()  # Capitalize: "mon" → "Mon"
    
    # Normalize class name
    aliases = {'BCS': 'CS', 'BSE': 'BS'}
    for alias, actual in aliases.items():
        class_name = class_name.replace(alias, actual)
    
    # Find correct case for class name
    actual_class = None
    for cls in TIMETABLE.keys():
        if cls.upper() == class_name:
            actual_class = cls
            break
    
    if not actual_class:
        return {
            "success": False,
            "error": f"Class '{class_name}' not found"
        }
    
    # Normalize day name
    day_map_reverse = {v: k for k, v in DAY_MAP.items()}
    if day not in DAY_MAP.values() and day not in day_map_reverse:
        return {
            "success": False,
            "error": f"Invalid day '{day}'. Use: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday or Mon, Tue, Wed, Thu, Fri, Sat"
        }
    
    day = DAY_MAP.get(day.lower(), day)
    
    # Get schedule
    timetable_data = TIMETABLE[actual_class]
    schedule = []
    
    for lecture_slot, entries in timetable_data.get(day, {}).items():
        for class_info in entries:
            schedule.append({
                "lecture": lecture_slot,
                "subject": class_info.get("subject", "N/A"),
                "teacher": class_info.get("teacher", "N/A"),
                "room": class_info.get("room", "N/A")
            })
    
    schedule.sort(key=lambda x: x["lecture"])
    
    return {
        "success": True,
        "class": actual_class,
        "day": day,
        "classes": schedule
    }


@app.get("/comsats/status")
def comsats_status():
    data = load_comsats_knowledge()
    return {
        "source": data.get("source", "https://www.comsats.edu.pk/"),
        "updated_at": data.get("updated_at"),
        "page_count": data.get("page_count", 0),
        "chunk_count": data.get("chunk_count", 0),
    }


@app.get("/comsats/refresh")
def comsats_refresh(max_pages: int = 20):
    max_pages = max(1, min(max_pages, 50))
    data = refresh_comsats_knowledge(max_pages=max_pages)
    response_cache.clear()
    return {
        "success": True,
        "updated_at": data.get("updated_at"),
        "page_count": data.get("page_count", 0),
        "chunk_count": data.get("chunk_count", 0),
        "errors": data.get("errors", []),
    }

@app.post("/ask")
def ask(q: Query):
    question = q.question
    q_lower = question.lower()

    # Check cache first (faster response)
    cache_key = q_lower.strip()
    if cache_key in response_cache:
        return {"answer": response_cache[cache_key]}

    if is_comsats_question(question):
        direct_answer = get_comsats_direct_answer(question)
        if direct_answer:
            response_cache[cache_key] = direct_answer
            return {"answer": direct_answer}

    # ── Off-topic guard: refuse anything unrelated to timetable ──
    if is_comsats_question(question) and not detect_class(question) and not detect_room(question):
        direct_answer = get_comsats_direct_answer(question)
        if direct_answer:
            response_cache[cache_key] = direct_answer
            return {"answer": direct_answer}

        chunks = search_comsats_knowledge(question)
        if not chunks:
            answer = (
                "I can answer COMSATS University questions, but my official website cache is empty right now.\n\n"
                "Start the backend and open this URL once to scrape/update the data:\n"
                "http://127.0.0.1:8000/comsats/refresh\n\n"
                "After that, ask me about COMSATS campuses, admissions, programs, research, or official news."
            )
            response_cache[cache_key] = answer
            return {"answer": answer}

        context = build_comsats_context(chunks)
        prompt = f"""Question: {question}

Official COMSATS website context:
{context}
"""
        try:
            try:
                response = chat(
                    model="llama3.2:1b",
                    messages=[
                        {"role": "system", "content": COMSATS_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    stream=False,
                    options={"num_predict": 220}
                )
            except:
                response = chat(
                    model="llama3.1",
                    messages=[
                        {"role": "system", "content": COMSATS_PROMPT},
                        {"role": "user", "content": prompt}
                    ],
                    stream=False,
                    options={"num_predict": 220}
                )
            answer = response["message"]["content"]
        except Exception:
            source_lines = []
            for c in chunks[:3]:
                source_lines.append(f"- {c['title']}: {c['text'][:280]}...\n  Source: {c['url']}")
            answer = "Here is what I found in the scraped COMSATS website data:\n\n" + "\n".join(source_lines)

        response_cache[cache_key] = answer
        return {"answer": answer}

    if is_off_topic(question):
        refusal = (
            "🎓 I'm Campus AI — your university timetable assistant! "
            "I can only help with class schedules, teacher availability, room info, and COMSATS University information.\n\n"
            "Try asking something like:\n"
            "• 'What are BCS-I classes on Monday?'\n"
            "• 'Is Sir Kamran free on Friday?'\n"
            "• 'Show me BSSE-3 timetable for today'"
        )
        response_cache[cache_key] = refusal
        return {"answer": refusal}

    # ── 0. Room availability query ─────────────────────────────────────────
    cls = detect_class(question)
    teacher = detect_teacher(question)
    room = detect_room(question)
    slot_filter, time_label = _make_time_filter(question)

    if is_teacher_intent(question, teacher):
        # Only show ambiguity warning when detect_teacher() couldn't confidently
        # pick a single teacher AND there are genuinely multiple candidates.
        # If detect_teacher already resolved a name, trust it and skip ambiguity.
        if teacher is None:
            ambiguous_teachers = teacher_name_candidates(question)
            if len(ambiguous_teachers) > 1:
                answer = {
                    "type": "teacher_ambiguous",
                    "message": "I found more than one matching teacher. Please ask with the full name.",
                    "matches": ambiguous_teachers,
                }
                response_cache[cache_key] = answer
                return {"answer": answer}

        if cls and ("all teachers" in q_lower or "teachers teaching" in q_lower):
            answer = {"type": "class_teachers", "class": cls, "teachers": teachers_for_class(cls)}
            response_cache[cache_key] = answer
            return {"answer": answer}

        if "which teacher" in q_lower and ("free right now" in q_lower or "free now" in q_lower):
            answer = {"type": "teachers_free_now", **get_teachers_free_now()}
            response_cache[cache_key] = answer
            return {"answer": answer}

        if "who teaches" in q_lower:
            results = classes_for_subject(question)
            if results:
                answer = {"type": "subject_teachers", "matches": results}
                response_cache[cache_key] = answer
                return {"answer": answer}

        if not teacher:
            if "teacher schedule" in q_lower and detect_day(question):
                response_text = "Please mention a teacher name, for example: 'Show schedule of Sir Kamran on Monday'."
            elif "now" in q_lower or "current" in q_lower or "who" in q_lower or "which" in q_lower:
                response_text = "There are many teachers in the timetable. Please ask by name so I can check exact free/busy slots.\n"
            else:
                response_text = "I couldn't find a teacher matching that name in the timetable.\n"
            sample_teachers = sorted(ALL_TEACHERS)[:8]
            response_text += "\nExamples of valid names:\n" + ", ".join(sample_teachers)
            response_text += f"\n\nTry asking: 'Is {sample_teachers[0]} free on Monday?'"
            response_cache[cache_key] = response_text
            return {"answer": response_text}

        if "next class" in q_lower:
            answer = {"type": "teacher_next_class", "teacher": teacher, "class_info": find_next_teacher_class(teacher)}
            response_cache[cache_key] = answer
            return {"answer": answer}

        days_list = detect_day(question)
        asks_teaching_classes = any(p in q_lower for p in ["classes does", "classes taken", "have classes", "does ", " teach", "teaches", "taken by"])
        if asks_teaching_classes:
            answer = {
                "type": "teacher_classes",
                "teacher": teacher,
                "classes": get_teacher_classes(teacher, days_list or WEEK_DAYS, slot_filter),
            }
            response_cache[cache_key] = answer
            return {"answer": answer}

        if not days_list:
            days_list = WEEK_DAYS if any(p in q_lower for p in ["week", "all classes", "schedule", "busy", "available", "free"]) else [today_name()]

        avail = get_teacher_availability(teacher, days_list)
        days_data = []
        for d, data in avail.items():
            busy_list = []
            for slot, infos in sorted(data["busy"].items(), key=lambda x: _slot_start_minutes(x[0])):
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

        answer = {"type": "teacher_availability", "teacher": teacher, "days": days_data}
        response_cache[cache_key] = answer
        return {"answer": answer}

    if (
        "all rooms" in q_lower
        or "available rooms" in q_lower
        or "rooms are free" in q_lower
        or "rooms are empty" in q_lower
        or "room availability" in q_lower
        or "room usage" in q_lower
        or "lecture theaters" in q_lower
        or "lecture theatres" in q_lower
    ):
        days_list = detect_day(question) or ([today_name()] if "today" in q_lower or "now" in q_lower else WEEK_DAYS)
        active_filter = slot_filter or (lambda slot: True)
        want_busy_schedule = "schedule" in q_lower or "usage" in q_lower or "occupied" in q_lower or "busy" in q_lower
        rooms = all_rooms_at(days_list, active_filter, want_free=not want_busy_schedule)
        if "lecture theater" in q_lower or "lecture theatre" in q_lower:
            rooms = [r for r in rooms if r["room"].startswith("LT ")]
        answer = {
            "type": "rooms_schedule" if want_busy_schedule else "rooms_free",
            "days": days_list,
            "rooms": rooms,
        }
        response_cache[cache_key] = answer
        return {"answer": answer}

    is_room_query = is_room_intent(question, room)

    if room:
        days_list = detect_day(question)
        if not days_list:
            days_list = [today_name()] if any(p in q_lower for p in ["today", "now", "right now"]) else WEEK_DAYS

        avail = get_room_availability(room, days_list)

        days_data = []
        for d, data in avail.items():
            busy_list = []
            for slot, infos in sorted(data["busy"].items(), key=lambda x: _slot_start_minutes(x[0])):
                if slot_filter and not slot_filter(slot):
                    continue
                cls_names = [i["class"] for i in infos]
                subjects  = [i.get("subject", "") for i in infos]
                teachers  = [i.get("teacher", "N/A") for i in infos]
                busy_list.append({"slot": slot, "classes": cls_names, "subjects": subjects, "teachers": teachers})
            free_slots = [s for s in data["free"] if not slot_filter or slot_filter(s)]
            days_data.append({"day": d, "free": free_slots, "busy": busy_list})

        answer = {
            "type": "room_availability",
            "room": room,
            "days": days_data,
        }
        response_cache[cache_key] = answer
        return {"answer": answer}


    elif is_room_query:
        if cls and ("which room" in q_lower or "room is used" in q_lower or "rooms used" in q_lower):
            rows = []
            for row in get_class_week_schedule(cls):
                rows.append({
                    "day": row["day"],
                    "time": row["time"].split(" - ", 1)[-1],
                    "room": row["room"],
                    "subject": row["subject"],
                    "teacher": row["teacher"],
                })
            answer = {"type": "class_rooms", "class": cls, "rooms": rows}
            response_cache[cache_key] = answer
            return {"answer": answer}

        # User asked about a room but we couldn't detect which one
        sample_rooms = sorted(ALL_ROOMS)[:12]
        response_text = (
            "\U0001f3db\ufe0f I couldn't identify the room you're asking about.\n\n"
            "You can ask me about any of these rooms:\n"
            + ", ".join(sample_rooms)
            + "\n\nExamples:\n"
            "\u2022 'Is LT 4 free on Monday?'\n"
            "\u2022 'When is CR 2 free this week?'\n"
            "\u2022 'Show LH 1 schedule for Friday'"
        )
        response_cache[cache_key] = response_text
        return {"answer": response_text}

    # ── Secondary teacher check (only when no class detected) ────────────────
    # Prevents "Is BS(SE)-III free?" hitting teacher-not-found path via 'free'.
    if not cls:
        is_teacher_query2 = any(k in q_lower for k in [
            "free", "available", "sir", "teacher", "professor", "dr", "mr", "ms", "miss"
        ])
        teacher_sec = detect_teacher(question)

        if is_teacher_query2 and teacher_sec:
            days_list = detect_day(question)
            if not days_list:
                days_list = [today_name()]
            avail = get_teacher_availability(teacher_sec, days_list)
            response_text = f"\U0001f468\u200d\U0001f3eb {teacher_sec}\n\n"
            for d, data in avail.items():
                response_text += f"\U0001f4c5 {d}\n"
                if data["free"]:
                    response_text += "\U0001f7e2 Free: " + ", ".join(data["free"]) + "\n"
                else:
                    response_text += "\U0001f7e2 Free: No free slots\n"
                if data["busy"]:
                    busy_lines = [f"{time} ({info[0]['class']})" for time, info in data["busy"].items()]
                    response_text += "\U0001f534 Busy: " + ", ".join(busy_lines) + "\n"
                else:
                    response_text += "\U0001f534 Busy: No classes scheduled\n"
                response_text += "\n"
            response_cache[cache_key] = response_text.strip()
            return {"answer": response_text.strip()}

        elif is_teacher_query2 and not teacher_sec:
            if "now" in q_lower or "current" in q_lower or "who" in q_lower or "which" in q_lower:
                response_text = "There are many teachers available! To check someone's schedule, please ask by name.\n"
            else:
                response_text = "I couldn't find a teacher matching that name in the timetable.\n"
            sample_teachers = sorted(ALL_TEACHERS)[:8]
            response_text += "\nHere are some examples of valid names you can check:\n"
            response_text += ", ".join(sample_teachers) + "..."
            response_text += f"\n\nTry asking: 'Is {sample_teachers[0]} free on Monday?'"
            response_cache[cache_key] = response_text
            return {"answer": response_text}


    # Timetable query - prioritize quick responses
    if timetable_question(question):
        days_list = detect_day(question)

        if not cls:
            answer = "Please mention your class name, for example: BCS-I, BA-II, CS-III, CE-IV etc."
            response_cache[cache_key] = answer
            return {"answer": answer}

        if "next class" in q_lower:
            next_class = find_next_class(cls)
            answer = {"type": "next_class", "class": cls, "class_info": next_class}
            response_cache[cache_key] = answer
            return {"answer": answer}

        if not days_list:
            if wants_full_week(question) or (slot_filter and not any(p in q_lower for p in ["today", "tomorrow", "right now", "now", "current"])):
                days_list = WEEK_DAYS
            else:
                days_list = [today_name()]

        aggregated_schedule = []
        for d in days_list:
            sched = get_schedule(cls, d, slot_filter)
            if sched:
                aggregated_schedule.extend(sched)
        
        # If schedule is found, return structured JSON for class cards
        if aggregated_schedule:
            # Format the day string for the header nicely
            if len(days_list) == 6:
                display_day = "the Whole Week"
            elif len(days_list) > 1:
                display_day = ", ".join(days_list[:-1]) + f" & {days_list[-1]}"
            else:
                display_day = days_list[0]
                
            answer = {
                "type": "schedule",
                "class": cls,
                "day": display_day,
                "classes": aggregated_schedule
            }
            response_cache[cache_key] = answer
            return {"answer": answer}
        
        display_day = "the requested days" if len(days_list) > 1 else days_list[0]
        suffix = f" {time_label}" if time_label else ""
        answer = f"{cls} has no classes on {display_day}{suffix}."
        response_cache[cache_key] = answer
        return {"answer": answer}

    else:
        # For general questions, keep prompt concise to speed up response
        prompt = question

    try:
        # Use faster lightweight model for quicker responses
        try:
            response = chat(
                model="llama3.2:1b",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt}
                ],
                stream=False,
                options={"num_predict": 150}  # Limit response length for faster generation
            )
            answer = response["message"]["content"]
        except:
            # Fallback to llama3.1 if llama3.2:1b not available
            response = chat(
                model="llama3.1",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt}
                ],
                stream=False,
                options={"num_predict": 150}  # Limit response length
            )
            answer = response["message"]["content"]
        
        # Cache the response
        response_cache[cache_key] = answer
        return {"answer": answer}
        
    except Exception as e:
        error_msg = f"⚠️ AI service temporarily unavailable. Error: {str(e)[:50]}"
        return {"answer": error_msg}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
