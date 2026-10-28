"""Optional WAQI city feed. The feed may report a US-style AQI."""
import os
from urllib.parse import quote
from .base import LiveProvider, utc_now


class WAQIProvider(LiveProvider):
    name = "WAQI"
    quality = "station"

    @property
    def enabled(self):
        return bool(os.getenv("WAQI_TOKEN"))

    def fetch_current(self, city):
        if not self.enabled:
            return None
        payload = self.get_json(f'https://api.waqi.info/feed/{quote(city["name"])}/', params={"token": os.environ["WAQI_TOKEN"]})
        if payload.get("status") != "ok":
            return None
        data = payload.get("data", {})
        iaqi = data.get("iaqi", {})
        metrics = {"pm25": iaqi.get("pm25", {}).get("v"), "pm10": iaqi.get("pm10", {}).get("v")}
        return {"time": data.get("time", {}).get("iso", utc_now()), "city": city["name"], "metrics": metrics,
            "reported_aqi": data.get("aqi"), "aqi_standard": "provider-reported; not Indian national AQI",
            "source": self.name, "station": data.get("city", {}).get("name"), "fetched_at": utc_now(), "data_quality": "station"}

    def fetch_history(self, city, hours=48):
        return []
