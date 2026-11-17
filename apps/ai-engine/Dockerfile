FROM python:3.12-slim
WORKDIR /srv
RUN useradd --system --uid 10001 govmind
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
USER govmind
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
