# AI Traffic Predictor

This service adjusts a base travel-time matrix with congestion multipliers before optimization.

## Run

```bash
cd services/ai-predictor
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python predictor.py
```

Service listens on `http://localhost:5001`.

## API

### `POST /adjust`

Request body:

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

Response body:

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

## Congestion Model

The predictor applies corridor-based multipliers on weekdays.

- `autopista_norte`: peak 07:00-09:00 and 17:00-19:00, multiplier `1.8`
- `calle_80`: peak 07:00-09:00, multiplier `1.6`
- `carrera_7`: peak 12:00-14:00 and 17:00-19:00, multiplier `1.5`

For each origin-destination pair, the maximum applicable multiplier is used.

## Notes

- If `departure_time` is missing or invalid, the service uses current UTC time.
- Distances are left unchanged; only durations are adjusted.
