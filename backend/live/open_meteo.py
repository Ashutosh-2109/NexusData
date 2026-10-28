"""Keyless model weather and air quality for Indian coordinates."""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from .base import LiveProvider, utc_now


# CPCB 24-hour PM2.5, PM10 and NO2 concentration breakpoints.
BREAKPOINTS = {
    "pm25": [(0, 30), (31, 60), (61, 90), (91, 120), (121, 250), (251, 500)],
    "pm10": [(0, 50), (51, 100), (101, 250), (251, 350), (351, 430), (431, 600)],
    "no2": [(0, 40), (41, 80), (81, 180), (181, 280), (281, 400), (401, 600)],
}
INDEX_BANDS = [(0, 50), (51, 100), (101, 200), (201, 300), (301, 400), (401, 500)]


def indian_aqi_estimate(rows: list[dict]) -> int | None:
    """CPCB-style subindices from three model pollutants; clearly an estimate."""
    if len(rows) < 18:
        return None
    subindices = []
    for key, bands in BREAKPOINTS.items():
        values = [r[key] for r in rows[-24:] if isinstance(r.get(key), (int, float))]
        if len(values) < 18:
            return None
        concentration = sum(values) / len(values)
        for (c_low, c_high), (i_low, i_high) in zip(bands, INDEX_BANDS):
            if concentration <= c_high:
                subindices.append(i_low + (min(concentration, c_high) - c_low) * (i_high - i_low) / max(c_high - c_low, 1))
                break
        else:
            subindices.append(500)
    return round(max(subindices))


class OpenMeteoProvider(LiveProvider):
    name = "Open-Meteo"
    quality = "model"

    def __init__(self, session=None):
        super().__init__(session)
        self._cache: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _params(cities: list[dict]) -> dict:
        return {"latitude": ",".join(str(c["lat"]) for c in cities), "longitude": ",".join(str(c["lon"]) for c in cities), "timezone": "UTC", "past_hours": 48, "forecast_hours": 1}

    def fetch_many(self, cities: list[dict]) -> dict[str, dict]:
        if not cities:
            return {}
        params = self._params(cities)
        weather = self.get_json("https://api.open-meteo.com/v1/forecast", params={**params, "hourly": "temperature_2m,relative_humidity_2m"})
        air = self.get_json("https://air-quality-api.open-meteo.com/v1/air-quality", params={**params, "hourly": "pm2_5,pm10,nitrogen_dioxide"})
        if len(cities) == 1:
            weather, air = [weather], [air]
        fetched_at = utc_now()
        result = {}
        for city, w, a in zip(cities, weather, air):
            wh, ah = w.get("hourly", {}), a.get("hourly", {})
            air_by_time = {t: i for i, t in enumerate(ah.get("time", []))}
            raw_rows = []
            for i, timestamp in enumerate(wh.get("time", [])):
                j = air_by_time.get(timestamp)
                def value(data, field, idx):
                    values = data.get(field, [])
                    return values[idx] if idx is not None and idx < len(values) else None
                raw_rows.append({"time": timestamp + "Z" if not timestamp.endswith("Z") else timestamp,
                    "temperature": value(wh, "temperature_2m", i), "humidity": value(wh, "relative_humidity_2m", i),
                    "pm25": value(ah, "pm2_5", j), "pm10": value(ah, "pm10", j), "no2": value(ah, "nitrogen_dioxide", j)})
            series = []
            current_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
            for i, row in enumerate(raw_rows):
                if row["time"].replace("Z", "") > current_hour:
                    continue
                metrics = {k: v for k, v in row.items() if k != "time"}
                metrics["aqi"] = indian_aqi_estimate(raw_rows[max(0, i - 23):i + 1])
                series.append({"time": row["time"], "city": city["name"], "metrics": metrics,
                    "source": self.name, "fetched_at": fetched_at, "data_quality": "model"})
            bundle = {"current": series[-1] if series else None, "history": series[-48:]}
            result[city["name"]] = bundle
        with self._lock:
            for name, bundle in result.items():
                self._cache[name] = (time.monotonic() + 900, bundle)
        return result

    def _bundle(self, city: dict) -> dict:
        with self._lock:
            cached = self._cache.get(city["name"])
            if cached and cached[0] > time.monotonic():
                return cached[1]
        return self.fetch_many([city])[city["name"]]

    def fetch_current(self, city: dict) -> dict | None:
        return self._bundle(city)["current"]

    def fetch_history(self, city: dict, hours: int = 48) -> list[dict]:
        return self._bundle(city)["history"][-hours:]
