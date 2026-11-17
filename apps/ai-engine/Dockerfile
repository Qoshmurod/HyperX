FROM python:3.12-slim
WORKDIR /srv
RUN useradd --system --uid 10001 govmind && mkdir -p /data && chown govmind /data
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
USER govmind
ENV QDRANT_PATH=/data/qdrant
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
