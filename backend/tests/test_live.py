import os
import time
import unittest
from unittest.mock import patch

from live.base import LiveProvider
from live.open_meteo import OpenMeteoProvider, indian_aqi_estimate
from live.openaq import OpenAQProvider
from live.waqi import WAQIProvider
from live.data_gov_in import DataGovInProvider
from live.registry import CITIES, canonical_city
from live.service import LiveService
from engine.processor import normalize_cities
import pandas as pd


class FakeResponse:
    status_code = 200
    headers = {}

    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, *payloads):
        self.payloads = iter(payloads)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(next(self.payloads))


class LiveTests(unittest.TestCase):
    def test_registry_aliases(self):
        self.assertGreaterEqual(len(CITIES), 26)
        self.assertEqual(canonical_city(" Bangalore "), "Bengaluru")
        self.assertEqual(canonical_city("Bombay"), "Mumbai")
        normalized, _ = normalize_cities(pd.DataFrame({"City": ["Bangalore", "BENGALURU"]}), "City")
        self.assertEqual(normalized["City"].tolist(), ["bengaluru", "bengaluru"])

    def test_open_meteo_model_series_and_aqi(self):
        times = [f"2026-01-01T{i:02d}:00" for i in range(24)]
        weather = {"hourly": {"time": times, "temperature_2m": [30] * 24, "relative_humidity_2m": [60] * 24}}
        air = {"hourly": {"time": times, "pm2_5": [40] * 24, "pm10": [80] * 24, "nitrogen_dioxide": [50] * 24}}
        provider = OpenMeteoProvider(FakeSession(weather, air))
        detail = provider.fetch_many([CITIES[0]])[CITIES[0]["name"]]
        self.assertEqual(len(detail["history"]), 24)
        self.assertIsNotNone(detail["current"]["metrics"]["aqi"])
        self.assertEqual(detail["current"]["data_quality"], "model")
        self.assertIsNone(indian_aqi_estimate([{"pm25": 40}] * 17))

    def test_openaq_station(self):
        location = {"id": 7, "name": "Test station", "sensors": [{"id": 8, "parameter": {"name": "pm25"}}]}
        session = FakeSession({"results": [location]}, {"results": [{"sensorsId": 8, "value": 42, "datetime": {"utc": "2026-01-01T00:00:00Z"}}]})
        with patch.dict(os.environ, {"OPENAQ_API_KEY": "test"}):
            point = OpenAQProvider(session).fetch_current(CITIES[0])
        self.assertEqual(point["metrics"]["pm25"], 42)
        self.assertEqual(point["data_quality"], "station")
        self.assertEqual(session.calls[0][1]["headers"]["X-API-Key"], "test")

    def test_openaq_hourly_history(self):
        location = {"id": 7, "name": "Test station", "sensors": [{"id": 8, "parameter": {"name": "pm25"}}]}
        result = {"results": [{"period": {"datetimeTo": {"utc": "2026-01-01T01:00:00Z"}}, "value": 35}]}
        session = FakeSession({"results": [location]}, result)
        with patch.dict(os.environ, {"OPENAQ_API_KEY": "test"}):
            points = OpenAQProvider(session).fetch_history(CITIES[0])
        self.assertEqual(points[0]["metrics"]["pm25"], 35)
        self.assertEqual(points[0]["data_quality"], "station")

    def test_waqi_optional(self):
        session = FakeSession({"status": "ok", "data": {"aqi": 99, "iaqi": {"pm25": {"v": 51}}, "time": {"iso": "2026-01-01T00:00:00Z"}}})
        with patch.dict(os.environ, {"WAQI_TOKEN": "test"}):
            point = WAQIProvider(session).fetch_current(CITIES[0])
        self.assertEqual(point["reported_aqi"], 99)
        self.assertNotIn("aqi", point["metrics"])

    def test_data_gov_optional(self):
        session = FakeSession({"records": [{"pollutant_id": "PM2.5", "avg_value": "55"}]})
        with patch.dict(os.environ, {"DATA_GOV_IN_KEY": "test", "DATA_GOV_IN_RESOURCE_ID": "abc"}):
            point = DataGovInProvider(session).fetch_current(CITIES[0])
        self.assertEqual(point["metrics"]["pm25"], 55)
        self.assertEqual(point["data_quality"], "provisional")

    def test_service_ttl(self):
        class Primary:
            last_success = "2026-01-01T00:00:00Z"
            def __init__(self): self.calls = 0
            def fetch_many(self, cities):
                self.calls += 1
                return {c["name"]: {"current": {"metrics": {}}, "history": []} for c in cities}
        provider = Primary()
        service = LiveService(primary=provider, extras=[])
        service.refresh_all()
        service.refresh_all()
        self.assertEqual(provider.calls, 1)
        self.assertEqual(service.snapshot()["status"], "live")
        service._cache = {name: (0, bundle) for name, (_, bundle) in service._cache.items()}
        service.refresh_all()
        self.assertEqual(provider.calls, 2)

    def test_rate_limit_health(self):
        class LimitedSession:
            def get(self, *_args, **_kwargs):
                response = FakeResponse({})
                response.status_code = 429
                response.headers = {"Retry-After": "30"}
                return response
        provider = OpenMeteoProvider(LimitedSession())
        with self.assertRaises(RuntimeError):
            provider.get_json("https://example.invalid")
        self.assertEqual(provider.health()["status"], "rate_limited")


if __name__ == "__main__":
    unittest.main()
