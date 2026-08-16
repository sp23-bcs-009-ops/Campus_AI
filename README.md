# 🎓 Campus AI

AI-powered campus assistant for COMSATS University (Wah) — timetable Q&A,
teacher/room availability, COMSATS info via RAG, events, lost & found, and an
admin dashboard.

## 🚀 Quick start (one click)

| OS | Run this |
|---|---|
| **Windows** | double-click `START_CAMPUS_AI.bat` |
| **macOS / Linux** | `./START_CAMPUS_AI.sh` |

That's it. First run installs dependencies automatically, then:

- **App** → http://localhost:19006 (Expo web — same code runs on Android/iOS)
- **Backend** → http://localhost:8000/health · API docs at `/docs`

Requirements: **Python 3.10+** and **Node.js 18+** on PATH.
For AI chat answers, either have [Ollama](https://ollama.com) running with
`llama3.2:1b` pulled, **or** put an OpenAI key in `backend/.env`
(everything else works without any LLM).

## 📦 What's inside

```
Campus_AI/
├─ START_CAMPUS_AI.bat / .sh   ← one-click launchers
├─ backend/                    ← FastAPI + LangChain + ChromaDB RAG
│   ├─ API.py                  ← routes, rate limit, API-key auth, CORS
│   ├─ pipeline.py             ← intent router + per-session chat memory
│   ├─ timetable_service.py    ← deterministic timetable/teacher/room logic
│   ├─ rag_store.py            ← ChromaDB vector store (COMSATS website)
│   ├─ llm.py / config.py      ← swap Ollama ⇄ OpenAI with 2 env vars
│   └─ tests/                  ← 30 routing regression tests (pytest)
├─ Frontend/                   ← Expo / React Native app (web + mobile)
├─ dashboard/                  ← React admin dashboard (Firebase data)
├─ scripts/
│   └─ migrate_to_firestore.mjs← timetable JSON → Firestore migration
├─ firebase/
│   └─ firestore.rules         ← locked-down security rules (deploy these!)
└─ docker-compose.yml          ← full stack: backend + dashboard + frontend
```

## 🧪 Tests

```bash
cd backend && python -m pytest tests -q     # 30 passed
```

## 🐳 Docker (demo day)

```bash
docker compose up --build                        # backend :8000
docker compose --profile dashboard up --build    # + dashboard :5173
LLM_PROVIDER=openai OPENAI_API_KEY=sk-... docker compose up   # OpenAI mode
```

## 🔒 Security setup (do once)

1. **Firestore rules** — paste `firebase/firestore.rules` into
   Firebase Console → Firestore → Rules. The app already sends auth tokens
   with every write, so nothing breaks — but random strangers can no longer
   wipe your database.
2. **API key (optional)** — set `CAMPUS_AI_API_KEY=<secret>` in `backend/.env`
   to require `X-API-Key` on the backend endpoints.

## 🔄 Firebase migration + dashboard

```bash
node scripts/migrate_to_firestore.mjs     # timetable JSON → Firestore
cd dashboard && npm install && npm run dev  # → http://localhost:5173
```

The dashboard shows a **Live · Firebase** badge when reading Firestore and
falls back to a bundled snapshot when offline (demo-proof).
