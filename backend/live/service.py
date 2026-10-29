"""City snapshots, 15-minute TTL, graceful fallback, and live CSV bridge."""
from __future__ import annotations

import io
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from .registry import CITIES, get_city
from .open_meteo import OpenMeteoProvider
from .openaq import OpenAQProvider
from .waqi import WAQIProvider
from .data_gov_in import DataGovInProvider
from engine.development import score_city, suggestions
from engine.correlation import discover_correlations
from storage import load_live, save_live

logger = logging.getLogger(__name__)
TTL_SECONDS = 900


class LiveService:
    def __init__(self, primary=None, extras=None):
        self.primary = primary or OpenMeteoProvider()
        self.extras = extras if extras is not None else [OpenAQProvider(), WAQIProvider(), DataGovInProvider()]
        self._cache: dict[str, tuple[float, dict]] = {name: (0, bundle) for name, bundle in load_live().items()}
        self._lock = threading.RLock()
        self.last_refresh = None
        self.last_error = None

    def refresh_all(self, force=False):
        with self._lock:
            fresh = len(self._cache) == len(CITIES) and all(expiry > time.monotonic() for expiry, _ in self._cache.values())
            if fresh and not force:
                return self.snapshot()
        try:
            bundles = self.primary.fetch_many(CITIES)
            save_live(bundles)
            now = time.monotonic()
            with self._lock:
                for city in CITIES:
                    bundle = bundles.get(city["name"], {"current": None, "history": []})
                    self._cache[city["name"]] = (now + TTL_SECONDS, bundle)
                self.last_refresh = self.primary.last_success
                self.last_error = None
        except Exception as exc:
            self.last_error = str(exc)
            logger.warning("Live refresh failed: %s", exc)
        return self.snapshot()

    def snapshot(self):
        with self._lock:
            cached = {name: {**bundle, "stale": expiry <= time.monotonic()}
                for name, (expiry, bundle) in self._cache.items()}
        cities = [{**city, "current": cached.get(city["name"], {}).get("current"),
            "stale": cached.get(city["name"], {}).get("stale", True)} for city in CITIES]
        for city in cities:
            city["development"] = score_city(city, cached.get(city["name"], {}).get("history", []), cities)
        return {"cities": cities, "last_refresh": self.last_refresh, "error": self.last_error,
            "status": "live" if self.last_refresh and not self.last_error and all(c["current"] and not c["stale"] for c in cities) else "stale" if any(c["current"] for c in cities) else "offline"}

    def city_detail(self, name: str):
        city = get_city(name)
        if city is None:
            return None
        self.refresh_all()
        with self._lock:
            cached = self._cache.get(city["name"])
        bundle = cached[1] if cached else {"current": None, "history": []}
        observations = []
        enabled = [provider for provider in self.extras if provider.enabled]
        if enabled:
            with ThreadPoolExecutor(max_workers=len(enabled)) as pool:
                futures = {pool.submit(provider.fetch_current, city): provider for provider in enabled}
                for future, provider in futures.items():
                    try:
                        point = future.result()
                        if point:
                            observations.append(point)
                    except Exception as exc:
                        logger.warning("%s failed for %s: %s", provider.name, city["name"], exc)
        frame = pd.DataFrame([point["metrics"] for point in bundle["history"]])
        relationships = discover_correlations(frame, min_samples=10, prefer_cross_dataset=False)[:5] if not frame.empty else []
        score = score_city(city, bundle["history"], self.snapshot()["cities"])
        score["suggestions"] = suggestions(score, bundle["history"], relationships)
        return {"city": city, "current": bundle["current"], "history": bundle["history"],
            "station_observations": observations, "stale": not cached or cached[0] <= time.monotonic(),
            "relationships": relationships, "development": score}

    def provider_health(self):
        return [provider.health() for provider in [self.primary, *self.extras]]

    def live_frame(self):
        self.refresh_all()
        with self._lock:
            bundles = [item[1] for item in self._cache.values()]
        rows = []
        for bundle in bundles:
            for point in bundle.get("history", []):
                rows.append({"timestamp": point["time"], "city": point["city"],
                    **{f"live_{key}": value for key, value in point["metrics"].items()}})
        return pd.DataFrame(rows)

    def live_csv_bytes(self):
        frame = self.live_frame()
        return frame.to_csv(index=False).encode("utf-8") if not frame.empty else None


service = LiveService()
