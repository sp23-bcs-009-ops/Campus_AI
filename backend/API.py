"""
Campus AI — FastAPI backend.

Architecture (refactored):
    API.py               ← thin HTTP layer: routes, rate limit, auth, CORS
    pipeline.py          ← LangChain intent router + per-session memory
    timetable_service.py ← deterministic timetable/teacher/room logic
    rag_store.py         ← ChromaDB vector store over scraped COMSATS data
    llm.py               ← LLM provider (Ollama local ⇄ OpenAI demo)
    config.py            ← env-driven settings

Run:
    uvicorn API:app --host 0.0.0.0 --port 8000
"""
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import timetable_service as tt
from comsats_scraper import load_comsats_knowledge, refresh_comsats_knowledge
from config import settings
from llm import llm_info
from pipeline import answer_question
from rag_store import rag_store

# ─────────────────────────────────────────────────────────────────────────────
# App + middleware (rate limiter & API-key auth)
# ─────────────────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])

app = FastAPI(title="Campus AI", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: str | None = Header(default=None)):
    """API-key auth. Enabled only when CAMPUS_AI_API_KEY env var is set."""
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")


# ─────────────────────────────────────────────────────────────────────────────
# Startup: build the vector store from the scraped COMSATS knowledge
# ─────────────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def _startup():
    try:
        count = rag_store.ingest_from_knowledge_file()
        print(f"[RAG] ChromaDB ready — {count} chunks, embedder: {rag_store.embedder_name}")
    except Exception as e:
        print(f"[RAG] ingestion failed: {e}")
    print(f"[LLM] {llm_info()}")
    if not settings.api_key:
        print("[AUTH] CAMPUS_AI_API_KEY not set — API is open (dev mode)")


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class Query(BaseModel):
    question: str
    session_id: str | None = None  # optional: enables per-user chat memory


class StudentTimetableRequest(BaseModel):
    class_name: str  # e.g., "CS-I", "BS-II", "BA-I"


def resolve_class_name(raw: str) -> str | None:
    """Resolve any class-name variant (CS-I, BCS-1, BSSE-3 …) to a timetable key."""
    if raw in tt.TIMETABLE:
        return raw
    for cls in tt.TIMETABLE.keys():
        if cls.upper() == raw.upper():
            return cls
    return tt.detect_class(raw)


# ─────────────────────────────────────────────────────────────────────────────
# Health / info
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm": llm_info(),
        "rag": rag_store.status(),
        "auth_enabled": bool(settings.api_key),
        "rate_limit": settings.rate_limit,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Main chat endpoint — the old 1200-line body now lives in pipeline.py
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/ask", dependencies=[Depends(require_api_key)])
@limiter.limit(settings.rate_limit)
def ask(q: Query, request: Request):
    session_id = q.session_id or get_remote_address(request) or "default"
    result = answer_question(q.question, session_id=session_id)
    return {"answer": result["answer"], "intent": result["intent"]}


# ─────────────────────────────────────────────────────────────────────────────
# Timetable REST endpoints (unchanged behavior)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/student-timetable", dependencies=[Depends(require_api_key)])
def get_student_timetable(req: StudentTimetableRequest):
    """
    Get full timetable for a student's class
    Input: {"class_name": "CS-I"}
    """
    class_name = resolve_class_name(req.class_name)
    if not class_name:
        return {
            "success": False,
            "error": f"Class '{req.class_name}' not found in timetable",
            "available_classes": sorted(tt.TIMETABLE.keys()),
        }

    timetable_data = tt.TIMETABLE[class_name]
    formatted = {"class": class_name, "schedule_by_day": {}}
    for day, slots in timetable_data.items():
        formatted["schedule_by_day"][day] = []
        for lecture_slot, entries in slots.items():
            for class_info in entries:
                formatted["schedule_by_day"][day].append({
                    "lecture": lecture_slot,
                    "subject": class_info.get("subject", "N/A"),
                    "teacher": class_info.get("teacher", "N/A"),
                    "room": class_info.get("room", "N/A"),
                })
    for day in formatted["schedule_by_day"]:
        formatted["schedule_by_day"][day].sort(key=lambda x: x["lecture"])

    return {"success": True, "data": formatted}


@app.get("/today-classes/{class_name}", dependencies=[Depends(require_api_key)])
def get_today_classes(class_name: str):
    """Get today's classes for a student's class, e.g. /today-classes/CS-I"""
    actual_class = resolve_class_name(class_name)
    if not actual_class:
        return {
            "success": False,
            "error": f"Class '{class_name}' not found",
            "available_classes": sorted(tt.TIMETABLE.keys()),
        }

    today_day = tt.today_name()
    today_classes = []
    for lecture_slot, entries in tt.TIMETABLE[actual_class].get(today_day, {}).items():
        for class_info in entries:
            today_classes.append({
                "lecture": lecture_slot,
                "subject": class_info.get("subject", "N/A"),
                "teacher": class_info.get("teacher", "N/A"),
                "room": class_info.get("room", "N/A"),
            })
    today_classes.sort(key=lambda x: x["lecture"])

    return {
        "success": True,
        "class": actual_class,
        "day": today_day,
        "day_name": today_day,
        "classes": today_classes,
    }


@app.get("/class-schedule/{class_name}/{day}", dependencies=[Depends(require_api_key)])
def get_class_schedule_by_day(class_name: str, day: str):
    """Get schedule for a class on a specific day, e.g. /class-schedule/CS-I/Mon"""
    actual_class = resolve_class_name(class_name)
    if not actual_class:
        return {"success": False, "error": f"Class '{class_name}' not found"}

    if day.lower() not in tt.DAY_MAP:
        return {
            "success": False,
            "error": (
                f"Invalid day '{day}'. Use: Monday, Tuesday, Wednesday, Thursday, "
                "Friday, Saturday or Mon, Tue, Wed, Thu, Fri, Sat"
            ),
        }

    day = tt.DAY_MAP[day.lower()]
    schedule = []
    for lecture_slot, entries in tt.TIMETABLE[actual_class].get(day, {}).items():
        for class_info in entries:
            schedule.append({
                "lecture": lecture_slot,
                "subject": class_info.get("subject", "N/A"),
                "teacher": class_info.get("teacher", "N/A"),
                "room": class_info.get("room", "N/A"),
            })
    schedule.sort(key=lambda x: x["lecture"])

    return {"success": True, "class": actual_class, "day": day, "classes": schedule}


# ─────────────────────────────────────────────────────────────────────────────
# COMSATS knowledge management (scrape → JSON → ChromaDB)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/comsats/status")
def comsats_status():
    data = load_comsats_knowledge()
    return {
        "source": data.get("source", "https://www.comsats.edu.pk/"),
        "updated_at": data.get("updated_at"),
        "page_count": data.get("page_count", 0),
        "chunk_count": data.get("chunk_count", 0),
        "vector_store": rag_store.status(),
    }


@app.get("/comsats/refresh", dependencies=[Depends(require_api_key)])
@limiter.limit("2/minute")
def comsats_refresh(request: Request, max_pages: int = 20):
    max_pages = max(1, min(max_pages, 50))
    data = refresh_comsats_knowledge(max_pages=max_pages)
    count = rag_store.ingest_from_knowledge_file(force=True)
    return {
        "success": True,
        "updated_at": data.get("updated_at"),
        "page_count": data.get("page_count", 0),
        "chunk_count": data.get("chunk_count", 0),
        "vector_documents": count,
        "errors": data.get("errors", []),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
