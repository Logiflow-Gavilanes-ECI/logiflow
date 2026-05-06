# syntax=docker/dockerfile:1.7
# Production image for the AI Traffic Predictor.
# Flask is wrapped by gunicorn — the dev server (`flask run` /
# `app.run`) is not safe under real traffic.

ARG TARGETPLATFORM=linux/amd64
ARG PYTHON_VERSION=3.12

FROM --platform=${TARGETPLATFORM} python:${PYTHON_VERSION}-alpine AS deps
WORKDIR /install
RUN apk add --no-cache build-base
COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install/python-deps -r requirements.txt

FROM --platform=${TARGETPLATFORM} python:${PYTHON_VERSION}-alpine AS runtime
RUN apk add --no-cache dumb-init curl \
    && addgroup -S predictor && adduser -S predictor -G predictor

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/usr/local/lib/python-deps/lib/python3.12/site-packages \
    PATH=/usr/local/lib/python-deps/bin:$PATH \
    PORT=5001 \
    GUNICORN_WORKERS=2 \
    GUNICORN_TIMEOUT=30 \
    LOG_LEVEL=info

COPY --from=deps /install/python-deps /usr/local/lib/python-deps
COPY predictor.py ./

RUN chown -R predictor:predictor /app

USER predictor

EXPOSE 5001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS} --timeout ${GUNICORN_TIMEOUT} --access-logfile - --error-logfile - --log-level ${LOG_LEVEL} predictor:app"]
