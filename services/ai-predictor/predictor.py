import logging
import math
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import structlog
from flask import Flask, g, jsonify, request

# ---------------------------------------------------------------------------
# Logging — structlog renders JSON so CloudWatch / ELK can index every field.
# ---------------------------------------------------------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()

logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=getattr(logging, LOG_LEVEL, logging.INFO),
)

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, LOG_LEVEL, logging.INFO)
    ),
    cache_logger_on_first_use=True,
)

log = structlog.get_logger("ai-predictor")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "").strip()
SERVICE_NAME = "ai-predictor"

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Corridor model: axis-aligned bounding boxes and peak hour multipliers.
CORRIDORS = [
    {
        "name": "autopista_norte",
        "lat_min": 4.62,
        "lat_max": 4.78,
        "lon_min": -74.09,
        "lon_max": -74.01,
        "peak_windows": [(7, 9), (17, 19)],
        "multiplier": 1.8,
    },
    {
        "name": "calle_80",
        "lat_min": 4.66,
        "lat_max": 4.74,
        "lon_min": -74.16,
        "lon_max": -74.00,
        "peak_windows": [(7, 9)],
        "multiplier": 1.6,
    },
    {
        "name": "carrera_7",
        "lat_min": 4.58,
        "lat_max": 4.76,
        "lon_min": -74.09,
        "lon_max": -74.02,
        "peak_windows": [(12, 14), (17, 19)],
        "multiplier": 1.5,
    },
]


def parse_departure_time(value: str) -> datetime:
    if not value:
        return datetime.now(timezone.utc)

    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.now(timezone.utc)


def in_peak_window(hour: int, peak_windows: List[Tuple[int, int]]) -> bool:
    return any(start <= hour < end for start, end in peak_windows)


def point_in_bbox(location: Dict[str, float], corridor: Dict[str, object]) -> bool:
    lat = float(location.get("lat", 0.0))
    lon = float(location.get("lon", 0.0))
    return (
        corridor["lat_min"] <= lat <= corridor["lat_max"]
        and corridor["lon_min"] <= lon <= corridor["lon_max"]
    )


def corridor_multiplier_for_pair(
    origin: Dict[str, float],
    destination: Dict[str, float],
    departure: datetime,
) -> float:
    if departure.weekday() >= 5:
        return 1.0

    hour = departure.hour
    multiplier = 1.0

    for corridor in CORRIDORS:
        if not in_peak_window(hour, corridor["peak_windows"]):
            continue

        if point_in_bbox(origin, corridor) or point_in_bbox(destination, corridor):
            multiplier = max(multiplier, corridor["multiplier"])

    return multiplier


def adjust_durations(
    durations: List[int],
    locations: List[Dict[str, float]],
    departure: datetime,
) -> List[int]:
    if not locations:
        return durations

    size = len(locations)
    adjusted = list(durations)

    for i in range(size):
        for j in range(size):
            if i == j:
                continue

            offset = (i * size) + j
            base_duration = int(adjusted[offset] or 0)
            if base_duration <= 0:
                continue

            multiplier = corridor_multiplier_for_pair(
                locations[i], locations[j], departure
            )
            adjusted[offset] = int(round(base_duration * multiplier))

    return adjusted


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
class PayloadError(ValueError):
    """Raised when /adjust receives an invalid payload."""


def _coerce_matrix_entries(entries: List[Any], field: str) -> List[int]:
    coerced: List[int] = []
    for idx, value in enumerate(entries):
        # bool is an int subclass but never a valid duration/distance, so reject it.
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise PayloadError(
                f"matrix.{field}[{idx}] must be a number, got {type(value).__name__}"
            )
        if not math.isfinite(value):
            raise PayloadError(f"matrix.{field}[{idx}] must be finite")
        if value < 0:
            raise PayloadError(f"matrix.{field}[{idx}] must be non-negative")
        coerced.append(int(value))
    return coerced


def validate_matrix_payload(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise PayloadError("body must be a JSON object")

    matrix = payload.get("matrix")
    if not isinstance(matrix, dict):
        raise PayloadError("matrix is required and must be an object")

    durations = matrix.get("durations", [])
    distances = matrix.get("distances", [])
    locations = matrix.get("locations", [])

    if not isinstance(durations, list) or not isinstance(distances, list):
        raise PayloadError("matrix.durations and matrix.distances must be arrays")

    if not isinstance(locations, list):
        raise PayloadError("matrix.locations must be an array")

    n = len(locations)
    expected = n * n
    if len(durations) != expected:
        raise PayloadError(
            f"matrix.durations length {len(durations)} does not match locations^2 {expected}"
        )
    if distances and len(distances) != expected:
        raise PayloadError(
            f"matrix.distances length {len(distances)} does not match locations^2 {expected}"
        )

    for idx, loc in enumerate(locations):
        if not isinstance(loc, dict) or "lat" not in loc or "lon" not in loc:
            raise PayloadError(f"matrix.locations[{idx}] must have lat and lon")

    durations = _coerce_matrix_entries(durations, "durations")
    distances = _coerce_matrix_entries(distances, "distances") if distances else distances

    return {
        "matrix": matrix,
        "durations": durations,
        "distances": distances,
        "locations": locations,
        "departure_time": payload.get("departure_time", ""),
    }


# ---------------------------------------------------------------------------
# Request middleware: correlation IDs + auth + access logs
# ---------------------------------------------------------------------------
@app.before_request
def _request_start() -> None:
    g.start_time = time.perf_counter()
    correlation_id = (
        request.headers.get("X-Correlation-Id")
        or request.headers.get("X-Request-Id")
        or str(uuid.uuid4())
    )
    g.correlation_id = correlation_id
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        correlation_id=correlation_id,
        service=SERVICE_NAME,
        method=request.method,
        path=request.path,
    )


@app.before_request
def _enforce_internal_token():
    if not INTERNAL_TOKEN:
        return None

    # Health checks are intentionally unauthenticated so docker/k8s probes work.
    if request.path == "/health":
        return None

    provided = request.headers.get("X-Internal-Token", "")
    if provided != INTERNAL_TOKEN:
        log.warning("internal_token_rejected")
        return jsonify({"error": "unauthorized"}), 401

    return None


@app.after_request
def _request_end(response):
    duration_ms = int((time.perf_counter() - getattr(g, "start_time", time.perf_counter())) * 1000)
    response.headers["X-Correlation-Id"] = getattr(g, "correlation_id", "")
    log.info("request_completed", status=response.status_code, duration_ms=duration_ms)
    return response


@app.errorhandler(PayloadError)
def _handle_payload_error(error: PayloadError):
    log.warning("payload_invalid", reason=str(error))
    return jsonify({"error": "invalid_payload", "detail": str(error)}), 400


@app.errorhandler(Exception)
def _handle_unexpected(error: Exception):  # pragma: no cover - defensive
    log.exception("unhandled_exception", error=str(error))
    return jsonify({"error": "internal_error"}), 500


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health() -> tuple:
    return jsonify({"status": "ok", "service": SERVICE_NAME}), 200


@app.route("/adjust", methods=["POST"])
def adjust() -> tuple:
    payload = request.get_json(silent=True)
    parsed = validate_matrix_payload(payload or {})

    departure_dt = parse_departure_time(parsed["departure_time"])
    adjusted_durations = adjust_durations(
        parsed["durations"], parsed["locations"], departure_dt
    )

    log.info(
        "matrix_adjusted",
        locations=len(parsed["locations"]),
        departure_time=departure_dt.isoformat(),
    )

    response = {
        "matrix": {
            "durations": adjusted_durations,
            "distances": parsed["distances"],
            "locations": parsed["locations"],
        },
        "matrix_source": "ai-adjusted",
        "departure_time": departure_dt.isoformat(),
    }

    return jsonify(response), 200


if __name__ == "__main__":
    # Dev-only entry point. Production runs gunicorn (see Dockerfile CMD).
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5001")))
