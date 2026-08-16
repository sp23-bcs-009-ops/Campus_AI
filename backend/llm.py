"""
LLM provider abstraction — swap models by changing TWO env vars:

    LLM_PROVIDER=openai
    OPENAI_API_KEY=sk-...

Everything else in the codebase just calls get_chat_model() and never
cares whether it's talking to Ollama (local dev) or OpenAI (demo day).
"""
from functools import lru_cache

from config import settings


@lru_cache(maxsize=4)
def get_chat_model(temperature: float = 0.2, max_tokens: int = 300):
    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=30,
        )

    from langchain_ollama import ChatOllama

    return ChatOllama(
        model=settings.ollama_model,
        base_url=settings.ollama_host,
        temperature=temperature,
        num_predict=max_tokens,
    )


def get_fallback_chat_model(temperature: float = 0.2, max_tokens: int = 300):
    """Secondary model used when the primary Ollama model isn't pulled."""
    if settings.llm_provider == "openai":
        return None  # OpenAI has no local fallback

    from langchain_ollama import ChatOllama

    return ChatOllama(
        model=settings.ollama_fallback_model,
        base_url=settings.ollama_host,
        temperature=temperature,
        num_predict=max_tokens,
    )


def llm_info() -> dict:
    if settings.llm_provider == "openai":
        return {"provider": "openai", "model": settings.openai_model}
    return {
        "provider": "ollama",
        "model": settings.ollama_model,
        "fallback": settings.ollama_fallback_model,
        "host": settings.ollama_host,
    }
