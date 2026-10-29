"""Optional and unverified CPCB/data.gov.in adapter."""
import os
from .base import LiveProvider, utc_now


class DataGovInProvider(LiveProvider):
    name = "data.gov.in CPCB"
    quality = "provisional"

    @property
    def enabled(self):
        return bool(os.getenv("DATA_GOV_IN_KEY") and os.getenv("DATA_GOV_IN_RESOURCE_ID"))

    def fetch_current(self, city):
        if not self.enabled:
            return None
        resource = os.environ["DATA_GOV_IN_RESOURCE_ID"]
        payload = self.get_json(f"https://api.data.gov.in/resource/{resource}", params={
            "api-key": os.environ["DATA_GOV_IN_KEY"], "format": "json", "limit": 100,
            "filters[city]": city["name"]})
        records = payload.get("records", [])
        metrics = {}
        for row in records:
            pollutant = str(row.get("pollutant_id", "")).lower()
            value = row.get("avg_value")
            try:
                if pollutant in ("pm2.5", "pm25"):
                    metrics["pm25"] = float(value)
                elif pollutant == "pm10":
                    metrics["pm10"] = float(value)
            except (TypeError, ValueError):
                continue
        if not metrics:
            return None
        return {"time": utc_now(), "city": city["name"], "metrics": metrics, "source": self.name,
            "fetched_at": utc_now(), "data_quality": "provisional", "note": "Adapter schema is unverified; check source before use."}

    def fetch_history(self, city, hours=48):
        return []
