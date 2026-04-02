from datetime import datetime
from typing import Dict, List, Tuple

from flask import Flask, jsonify, request

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
        return datetime.utcnow()

    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.utcnow()


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


@app.route("/health", methods=["GET"])
def health() -> tuple:
    return jsonify({"status": "ok"}), 200


@app.route("/adjust", methods=["POST"])
def adjust() -> tuple:
    payload = request.get_json(silent=True) or {}
    matrix = payload.get("matrix", {})

    durations = matrix.get("durations", [])
    distances = matrix.get("distances", [])
    locations = matrix.get("locations", [])

    departure_time = payload.get("departure_time", "")
    departure_dt = parse_departure_time(departure_time)

    adjusted_durations = adjust_durations(durations, locations, departure_dt)

    response = {
        "matrix": {
            "durations": adjusted_durations,
            "distances": distances,
            "locations": locations,
        },
        "matrix_source": "ai-adjusted",
        "departure_time": departure_dt.isoformat(),
    }

    return jsonify(response), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
