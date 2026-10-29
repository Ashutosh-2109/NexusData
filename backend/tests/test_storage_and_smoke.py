import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

from main import app
from storage import load_live, load_merged, save_live, save_merged


def test_sqlite_restart_round_trip():
    with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"NEXUSDATA_DB_PATH": str(Path(directory) / "test.sqlite")}):
        frame = pd.DataFrame({"Standardized_Time": pd.to_datetime(["2026-01-01T00:00:00Z"]), "pm25": [42.0]})
        save_merged(frame, [{"filename": "test.csv"}])
        restored, summaries = load_merged()
        assert restored["pm25"].iloc[0] == 42.0
        assert summaries[0]["filename"] == "test.csv"
        point = {"city": "Mumbai", "time": "2026-01-01T00:00:00Z", "metrics": {"pm25": 42}, "source": "test", "fetched_at": "2026-01-01T00:00:00Z", "data_quality": "model"}
        save_live({"Mumbai": {"history": [point]}})
        assert load_live()["Mumbai"]["current"]["metrics"]["pm25"] == 42


def test_full_sample_flow_and_health():
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    response = client.post("/api/load-samples")
    assert response.status_code == 200
    result = response.json()
    assert result["summary"]["overlap"]["hours"] >= 300
    assert result["summary"]["total_rows"] > 300
    assert len(result["correlations"]) > 0
    assert client.get("/api/analysis/correlations").status_code == 200


def test_live_csv_bridge_into_existing_merge():
    from main import live_service
    live_csv = b"timestamp,city,live_pm25,live_temperature\n2026-07-29T00:00:00Z,Bengaluru,42,30\n"
    with patch.object(live_service, "live_csv_bytes", return_value=live_csv):
        response = TestClient(app).post("/api/load-samples?include_live=true")
    assert response.status_code == 200
    assert "live_pm25" in response.json()["summary"]["columns"]


def test_live_city_flow_without_network():
    from live import routes
    from live.registry import CITIES
    from live.service import LiveService

    class FakePrimary:
        last_success = "2026-01-01T00:00:00Z"
        def fetch_many(self, cities):
            output = {}
            for city in cities:
                series = [{"time": f"2026-01-{1 + i // 24:02d}T{i % 24:02d}:00Z", "city": city["name"],
                    "metrics": {"pm25": 40 + i / 5, "pm10": 80 + i / 2, "no2": 30 + i / 3,
                        "temperature": 28 + i / 4, "humidity": 60, "aqi": 100 + i},
                    "source": "Open-Meteo", "fetched_at": "2026-01-03T00:00:00Z", "data_quality": "model"} for i in range(48)]
                output[city["name"]] = {"current": series[-1], "history": series}
            return output

    fake = LiveService(primary=FakePrimary(), extras=[])
    with patch.object(routes, "service", fake):
        client = TestClient(app)
        city_list = client.get("/api/live/cities").json()
        assert len(city_list["cities"]) >= 26
        detail = client.get("/api/live/city/Bombay").json()
        assert detail["city"]["name"] == "Mumbai"
        assert len(detail["history"]) == 48
        assert detail["development"]["suggestions"]
        assert detail["relationships"]
        scenario = client.post("/api/live/city/Mumbai/scenario", json={"driver": "temperature", "target": "pm25", "change_percent": -10})
        assert scenario.status_code == 200
        assert scenario.json()["projected_target"] != scenario.json()["baseline_target"]
