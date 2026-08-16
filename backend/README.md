# Campus AI — Backend

FastAPI backend for the Campus AI assistant: timetable Q&A, teacher/room
availability, and COMSATS University info via RAG.

## Architecture

```
                        ┌──────────────────────────────┐
  POST /ask ──────────► │ API.py (thin HTTP layer)     │
                        │  • rate limiter (slowapi)    │
                        │  • X-API-Key auth middleware │
                        └──────────────┬───────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │ pipeline.py (LangChain)      │
                        │  IntentRouter + chat memory  │
                        └───┬──────────┬───────────┬───┘
                 timetable/ │          │ comsats   │ greetings/
                 teacher/   ▼          ▼           ▼ small-talk
              ┌──────────────────┐ ┌──────────┐ ┌─────────┐
              │timetable_service │ │rag_store │ │ llm.py  │
              │ (deterministic)  │ │(ChromaDB)│ │Ollama/  │
              └──────────────────┘ └──────────┘ │OpenAI   │
                                                └─────────┘
```

| File | Responsibility |
|---|---|
| `API.py` | Routes, CORS, rate limiting, API-key auth |
| `pipeline.py` | LangChain intent routing + per-session memory |
| `timetable_service.py` | All deterministic timetable/teacher/room logic |
| `rag_store.py` | ChromaDB vector store over scraped COMSATS pages |
| `llm.py` | LLM provider abstraction (Ollama ⇄ OpenAI) |
| `config.py` | Env-driven settings (reads `.env` too) |
| `comsats_scraper.py` | Scrapes comsats.edu.pk → `comsats_knowledge.json` |

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env          # optional, tweak as needed
uvicorn API:app --host 0.0.0.0 --port 8000
```

On startup the scraped COMSATS chunks are auto-ingested into ChromaDB
(`./chroma_db`, git-ignored). Refresh the knowledge base with:

```bash
python update_comsats_data.py       # or GET /comsats/refresh
```

## Run with Docker (demo day)

From the repo root:

```bash
docker compose up --build                      # backend on :8000, Ollama on host
docker compose --profile ollama up --build     # + containerized Ollama
docker compose --profile frontend up --build   # + Expo web frontend
```

## Swap the LLM for the demo

Change **two lines** (in `.env` or the environment):

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

That's it — every chain in the pipeline now uses OpenAI (`gpt-4o-mini` by
default, override with `OPENAI_MODEL`). Unset it to go back to local Ollama.

## Security

- **Rate limiting** — `RATE_LIMIT=20/minute` per client IP on `/ask`
  (429 when exceeded), `2/minute` on `/comsats/refresh`.
- **API key auth** — set `CAMPUS_AI_API_KEY=<secret>` and every data endpoint
  requires the header `X-API-Key: <secret>`. Leave unset for open dev mode.

## Chat memory

`POST /ask` accepts an optional `session_id`. Each session keeps:
- a sliding window of chat messages fed into the LLM chains, and
- entity memory (last teacher/class/room), so follow-ups work:

```
"Is Sir Kamran free on Friday?"   → teacher_availability (Friday)
"what about Tuesday?"             → same teacher, Tuesday ✓
```

## Key endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/ask` | Main chat endpoint `{question, session_id?}` |
| GET | `/health` | LLM provider, RAG status, auth/rate-limit config |
| POST | `/student-timetable` | Full timetable for a class |
| GET | `/today-classes/{class}` | Today's classes |
| GET | `/class-schedule/{class}/{day}` | Schedule for a specific day |
| GET | `/comsats/status` | Scrape + vector store status |
| GET | `/comsats/refresh` | Re-scrape website and rebuild vectors |
