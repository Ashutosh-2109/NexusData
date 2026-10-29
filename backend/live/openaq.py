"""Optional station observations from OpenAQ v3."""
import os
from datetime import datetime, timedelta, timezone
from .base import LiveProvider, utc_now


class OpenAQProvider(LiveProvider):
    name = "OpenAQ"
    quality = "station"

    @property
    def enabled(self):
        return bool(os.getenv("OPENAQ_API_KEY"))

    def _headers(self):
        return {"X-API-Key": os.environ["OPENAQ_API_KEY"]}

    def _locations(self, city):
        return self.get_json("https://api.openaq.org/v3/locations", headers=self._headers(),
            params={"coordinates": f'{city["lat"]},{city["lon"]}', "radius": 25000, "limit": 10}).get("results", [])

    def fetch_current(self, city):
        if not self.enabled:
            return None
        locations = self._locations(city)
        for location in locations:
            sensor_names = {s.get("id"): s.get("parameter", {}).get("name", "").lower() for s in location.get("sensors", [])}
            latest = self.get_json(f'https://api.openaq.org/v3/locations/{location["id"]}/latest', headers=self._headers()).get("results", [])
            metrics = {}
            for record in latest:
                parameter = sensor_names.get(record.get("sensorsId"), "")
                if parameter in ("pm25", "pm2.5"):
                    metrics["pm25"] = record.get("value")
                elif parameter == "pm10":
                    metrics["pm10"] = record.get("value")
            if metrics:
                return {"time": max((r.get("datetime", {}).get("utc", "") for r in latest), default=utc_now()),
                    "city": city["name"], "metrics": metrics, "source": self.name,
                    "station": location.get("name"), "fetched_at": utc_now(), "data_quality": "station"}
        return None

    def fetch_history(self, city, hours=48):
        if not self.enabled:
            return []
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        for location in self._locations(city):
            sensors = [sensor for sensor in location.get("sensors", [])
                if sensor.get("parameter", {}).get("name", "").lower() in ("pm25", "pm2.5", "pm10")]
            if not sensors:
                continue
            rows = {}
            for sensor in sensors[:2]:
                metric = "pm25" if sensor["parameter"]["name"].lower() in ("pm25", "pm2.5") else "pm10"
                payload = self.get_json(f'https://api.openaq.org/v3/sensors/{sensor["id"]}/hours',
                    headers=self._headers(), params={"datetime_from": cutoff, "limit": min(hours + 2, 100)})
                for record in payload.get("results", []):
                    moment = record.get("period", {}).get("datetimeTo", {}).get("utc") or record.get("datetimeTo", {}).get("utc")
                    if moment and isinstance(record.get("value"), (int, float)):
                        rows.setdefault(moment, {})[metric] = record["value"]
            fetched_at = utc_now()
            return [{"time": moment, "city": city["name"], "metrics": metrics, "source": self.name,
                "station": location.get("name"), "fetched_at": fetched_at, "data_quality": "station"}
                for moment, metrics in sorted(rows.items())][-hours:]
        return []
