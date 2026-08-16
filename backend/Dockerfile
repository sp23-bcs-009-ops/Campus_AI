FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROMA_DIR=/data/chroma_db

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code + data
COPY config.py llm.py rag_store.py pipeline.py timetable_service.py API.py \
     normalizer.py comsats_scraper.py pdf_to_json.py ./
COPY timetable_data.json timetable_flat.json comsats_knowledge.json ./

# Persist the vector store outside the image layer
VOLUME /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "API:app", "--host", "0.0.0.0", "--port", "8000"]
