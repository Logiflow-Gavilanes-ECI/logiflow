"""Unit and integration tests for the AI Traffic Predictor."""
from __future__ import annotations

import importlib
import os
from datetime import datetime, timezone

import pytest


@pytest.fixture
def predictor_module(monkeypatch):
    """Reload predictor with a clean env so INTERNAL_TOKEN can be toggled per test."""
    monkeypatch.delenv("INTERNAL_TOKEN", raising=False)
    import predictor as predictor_mod

    return importlib.reload(predictor_mod)


@pytest.fixture
def client(predictor_module):
    return predictor_module.app.test_client()


# ---------------------------------------------------------------------------
# Pure logic
# ---------------------------------------------------------------------------
class TestPeakWindow:
    def test_inside_window(self, predictor_module):
        assert predictor_module.in_peak_window(8, [(7, 9)])

    def test_outside_window(self, predictor_module):
        assert not predictor_module.in_peak_window(10, [(7, 9)])

    def test_window_is_half_open(self, predictor_module):
        # End hour is exclusive: 9 is no longer inside (7, 9).
        assert predictor_module.in_peak_window(7, [(7, 9)])
        assert not predictor_module.in_peak_window(9, [(7, 9)])

    def test_multiple_windows(self, predictor_module):
        assert predictor_module.in_peak_window(18, [(7, 9), (17, 19)])


class TestPointInBBox:
    def test_inside_autopista_norte(self, predictor_module):
        corridor = next(
            c for c in predictor_module.CORRIDORS if c["name"] == "autopista_norte"
        )
        assert predictor_module.point_in_bbox({"lat": 4.70, "lon": -74.05}, corridor)

    def test_outside_autopista_norte(self, predictor_module):
        corridor = next(
            c for c in predictor_module.CORRIDORS if c["name"] == "autopista_norte"
        )
        assert not predictor_module.point_in_bbox(
            {"lat": 4.50, "lon": -74.05}, corridor
        )


class TestCorridorMultiplier:
    def test_weekend_returns_neutral(self, predictor_module):
        # 2026-04-18 is a Saturday.
        saturday = datetime(2026, 4, 18, 8, 0, tzinfo=timezone.utc)
        result = predictor_module.corridor_multiplier_for_pair(
            {"lat": 4.70, "lon": -74.05},
            {"lat": 4.72, "lon": -74.04},
            saturday,
        )
        assert result == 1.0

    def test_weekday_peak_autopista_norte(self, predictor_module):
        # Wednesday 5pm — Autopista Norte peak window.
        wednesday = datetime(2026, 4, 15, 17, 30, tzinfo=timezone.utc)
        result = predictor_module.corridor_multiplier_for_pair(
            {"lat": 4.70, "lon": -74.05},
            {"lat": 4.72, "lon": -74.04},
            wednesday,
        )
        assert result == 1.8

    def test_weekday_off_peak_returns_neutral(self, predictor_module):
        # Wednesday 11am — outside every corridor's peak window.
        wednesday = datetime(2026, 4, 15, 11, 0, tzinfo=timezone.utc)
        result = predictor_module.corridor_multiplier_for_pair(
            {"lat": 4.70, "lon": -74.05},
            {"lat": 4.72, "lon": -74.04},
            wednesday,
        )
        assert result == 1.0

    def test_max_multiplier_when_corridors_overlap(self, predictor_module):
        # 5pm overlaps autopista_norte (1.8) and carrera_7 (1.5) windows;
        # the higher of the two applies.
        wednesday = datetime(2026, 4, 15, 17, 30, tzinfo=timezone.utc)
        result = predictor_module.corridor_multiplier_for_pair(
            {"lat": 4.70, "lon": -74.05},
            {"lat": 4.72, "lon": -74.04},
            wednesday,
        )
        assert result == 1.8


class TestAdjustDurations:
    def test_empty_locations_returns_unchanged(self, predictor_module):
        assert predictor_module.adjust_durations([1, 2, 3], [], datetime.now(timezone.utc)) == [
            1,
            2,
            3,
        ]

    def test_diagonal_is_preserved(self, predictor_module):
        wednesday = datetime(2026, 4, 15, 17, 30, tzinfo=timezone.utc)
        adjusted = predictor_module.adjust_durations(
            [0, 600, 600, 0],
            [
                {"lat": 4.70, "lon": -74.05},
                {"lat": 4.72, "lon": -74.04},
            ],
            wednesday,
        )
        assert adjusted[0] == 0 and adjusted[3] == 0

    def test_peak_multiplier_applies_off_diagonal(self, predictor_module):
        wednesday = datetime(2026, 4, 15, 17, 30, tzinfo=timezone.utc)
        adjusted = predictor_module.adjust_durations(
            [0, 600, 600, 0],
            [
                {"lat": 4.70, "lon": -74.05},
                {"lat": 4.72, "lon": -74.04},
            ],
            wednesday,
        )
        assert adjusted[1] == 1080  # 600 * 1.8
        assert adjusted[2] == 1080


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
class TestValidation:
    def test_rejects_non_object_body(self, predictor_module):
        with pytest.raises(predictor_module.PayloadError):
            predictor_module.validate_matrix_payload([])

    def test_rejects_missing_matrix(self, predictor_module):
        with pytest.raises(predictor_module.PayloadError):
            predictor_module.validate_matrix_payload({})

    def test_rejects_mismatched_durations_length(self, predictor_module):
        with pytest.raises(predictor_module.PayloadError):
            predictor_module.validate_matrix_payload(
                {
                    "matrix": {
                        "durations": [1, 2, 3],
                        "distances": [],
                        "locations": [
                            {"lat": 1, "lon": 2},
                            {"lat": 3, "lon": 4},
                        ],
                    }
                }
            )

    def test_rejects_location_without_lat_lon(self, predictor_module):
        with pytest.raises(predictor_module.PayloadError):
            predictor_module.validate_matrix_payload(
                {
                    "matrix": {
                        "durations": [0],
                        "distances": [0],
                        "locations": [{"lat": 1}],
                    }
                }
            )


# ---------------------------------------------------------------------------
# HTTP integration via Flask test client
# ---------------------------------------------------------------------------
class TestHealth:
    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.get_json()["status"] == "ok"


class TestAdjustEndpoint:
    def _payload(self):
        return {
            "matrix": {
                "durations": [0, 600, 600, 0],
                "distances": [0, 1000, 1000, 0],
                "locations": [
                    {"lat": 4.70, "lon": -74.05},
                    {"lat": 4.72, "lon": -74.04},
                ],
            },
            "departure_time": "2026-04-15T17:30:00Z",
        }

    def test_adjusts_at_peak(self, client):
        response = client.post("/adjust", json=self._payload())
        assert response.status_code == 200
        body = response.get_json()
        assert body["matrix_source"] == "ai-adjusted"
        assert body["matrix"]["durations"] == [0, 1080, 1080, 0]

    def test_returns_400_on_invalid_payload(self, client):
        response = client.post(
            "/adjust",
            json={"matrix": {"durations": [1], "distances": [], "locations": []}},
        )
        assert response.status_code == 400
        body = response.get_json()
        assert body["error"] == "invalid_payload"
        assert "durations" in body["detail"]

    def test_correlation_id_echoed_in_response_header(self, client):
        response = client.post(
            "/adjust",
            json=self._payload(),
            headers={"X-Correlation-Id": "abc-123"},
        )
        assert response.headers["X-Correlation-Id"] == "abc-123"


class TestInternalToken:
    @pytest.fixture
    def authed_client(self, monkeypatch):
        monkeypatch.setenv("INTERNAL_TOKEN", "s3cret")
        import predictor as predictor_mod

        importlib.reload(predictor_mod)
        return predictor_mod.app.test_client()

    def test_rejects_missing_token(self, authed_client):
        response = authed_client.post(
            "/adjust",
            json={
                "matrix": {
                    "durations": [0, 600, 600, 0],
                    "distances": [0, 1000, 1000, 0],
                    "locations": [
                        {"lat": 4.70, "lon": -74.05},
                        {"lat": 4.72, "lon": -74.04},
                    ],
                },
                "departure_time": "2026-04-15T17:30:00Z",
            },
        )
        assert response.status_code == 401

    def test_accepts_valid_token(self, authed_client):
        response = authed_client.post(
            "/adjust",
            headers={"X-Internal-Token": "s3cret"},
            json={
                "matrix": {
                    "durations": [0, 600, 600, 0],
                    "distances": [0, 1000, 1000, 0],
                    "locations": [
                        {"lat": 4.70, "lon": -74.05},
                        {"lat": 4.72, "lon": -74.04},
                    ],
                },
                "departure_time": "2026-04-15T17:30:00Z",
            },
        )
        assert response.status_code == 200

    def test_health_bypasses_auth(self, authed_client):
        response = authed_client.get("/health")
        assert response.status_code == 200


def teardown_module(_module):
    # Restore the module to a known clean state for downstream test files.
    os.environ.pop("INTERNAL_TOKEN", None)
    import predictor as predictor_mod

    importlib.reload(predictor_mod)
