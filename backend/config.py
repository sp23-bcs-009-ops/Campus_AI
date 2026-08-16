"""
Central configuration for Campus AI backend.
Everything is driven by environment variables so the same code runs
locally (Ollama), in Docker, or on demo day with OpenAI.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    """Tiny .env loader (no external dependency). Real env vars win."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


class Settings:
    # ── LLM provider ─────────────────────────────────────────────
    # Swap the LLM for demo day by changing these two values (or env vars):
    #   LLM_PROVIDER=openai  OPENAI_API_KEY=sk-...
    llm_provider: str = _env("LLM_PROVIDER", "ollama").lower()   # "ollama" | "openai"
    openai_model: str = _env("OPENAI_MODEL", "gpt-4o-mini")

    openai_api_key: str = _env("OPENAI_API_KEY")
    ollama_model: str = _env("OLLAMA_MODEL", "llama3.2:1b")
    ollama_fallback_model: str = _env("OLLAMA_FALLBACK_MODEL", "llama3.1")
    ollama_host: str = _env("OLLAMA_HOST", "http://127.0.0.1:11434")

    # ── RAG / ChromaDB ───────────────────────────────────────────
    chroma_dir: str = _env("CHROMA_DIR", str(BASE_DIR / "chroma_db"))
    rag_top_k: int = int(_env("RAG_TOP_K", "4"))

    # ── Security ─────────────────────────────────────────────────
    # If CAMPUS_AI_API_KEY is set, every request must send
    # header  X-API-Key: <key>.  Leave unset to keep the API open (dev).
    api_key: str = _env("CAMPUS_AI_API_KEY")
    rate_limit: str = _env("RATE_LIMIT", "20/minute")

    # Comma-separated allowed origins. "*" (default) = open, for dev.
    # For production set e.g.  CORS_ORIGINS=https://myapp.com,https://admin.myapp.com
    cors_origins: list = [
        o.strip() for o in _env("CORS_ORIGINS", "*").split(",") if o.strip()
    ]

    # ── Knowledge freshness ──────────────────────────────────────
    # Auto re-scrape COMSATS website on startup if cache is older than this
    # many days (0 disables the check).
    knowledge_max_age_days: int = int(_env("KNOWLEDGE_MAX_AGE_DAYS", "7"))

    # ── Memory ───────────────────────────────────────────────────
    memory_window: int = int(_env("MEMORY_WINDOW", "8"))  # messages kept per session


settings = Settings()

# Auto-select OpenAI when a key is present but provider was left on default.
if settings.openai_api_key and _env("LLM_PROVIDER", "") == "":
    settings.llm_provider = "openai"
