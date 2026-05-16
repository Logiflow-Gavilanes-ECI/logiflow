<div align="center">

# LogiFlow AI Traffic Predictor

Python microservice that adjusts travel-time matrices with corridor-based congestion multipliers.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)

</div>

---

## Overview

The AI Traffic Predictor sits between the Gateway and the Optimizer. Before route optimization runs, this service adjusts the travel-time matrix based on real-world Bogotá traffic patterns — applying corridor-specific congestion multipliers that vary by time of day and day of week.

```text
Gateway → POST /adjust → AI Predictor → adjusted matrix → Optimizer (VROOM)
```

---

## Congestion Model

The predictor uses corridor-based multipliers calibrated to Bogotá peak-hour patterns.

| Corridor | Peak Hours | Multiplier |
|----------|-----------|------------|
| **Autopista Norte** | 07:00–09:00, 17:00–19:00 | `1.8×` |
| **Calle 80** | 07:00–09:00 | `1.6×` |
| **Carrera 7** | 12:00–14:00, 17:00–19:00 | `1.5×` |

- Multipliers apply **only on weekdays**.
- For each origin-destination pair, the **maximum** applicable multiplier is used.
- **Distances remain unchanged** — only durations are adjusted.

---

## API

### `POST /adjust`

Receives a travel-time matrix and departure time, returns the congestion-adjusted matrix.

**Request:**

```json
{
  "matrix": {
    "durations": [0, 600, 620, 0],
    "distances": [0, 4200, 4300, 0],
    "locations": [
      { "lat": 4.651, "lon": -74.058 },
      { "lat": 4.711, "lon": -74.072 }
    ]
  },
  "departure_time": "2026-03-27T22:00:00Z"
}
```

**Response:**

```json
{
  "matrix": {
    "durations": [0, 1080, 1116, 0],
    "distances": [0, 4200, 4300, 0],
    "locations": [
      { "lat": 4.651, "lon": -74.058 },
      { "lat": 4.711, "lon": -74.072 }
    ]
  },
  "matrix_source": "ai-adjusted",
  "departure_time": "2026-03-27T22:00:00+00:00"
}
```

---

## Quick Start

```bash
cd services/ai-predictor
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python predictor.py
```

Service listens on `http://localhost:5001`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | HTTP server port |

---

## Notes

- If `departure_time` is missing or invalid, the service defaults to current UTC time.
- The service is stateless — no database required.
- In Docker Compose, runs as the `ai-predictor` container.
