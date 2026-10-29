"""Common provider contract and bounded HTTP transport."""
from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

import requests


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LiveProvider(ABC):
    name = "unknown"
    quality = "provisional"

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.last_success: str | None = None
        self.last_error: str | None = None
        self.rate_limited_until = 0.0

    @property
    def enabled(self) -> bool:
        return True

    def health(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "enabled": self.enabled,
            "status": "rate_limited" if time.time() < self.rate_limited_until else ("error" if self.last_error else "ready" if self.enabled else "disabled"),
            "last_success": self.last_success,
            "last_error": self.last_error,
        }

    def get_json(self, url: str, **kwargs: Any) -> Any:
        if time.time() < self.rate_limited_until:
            raise RuntimeError(f"{self.name} rate limited")
        timeout = float(os.getenv("LIVE_HTTP_TIMEOUT_SECONDS", "8"))
        for attempt in range(3):
            try:
                response = self.session.get(url, timeout=timeout, **kwargs)
                if response.status_code == 429:
                    delay = min(float(response.headers.get("Retry-After", 60)), 300)
                    self.rate_limited_until = time.time() + delay
                    raise RuntimeError(f"{self.name} rate limited for {delay:g}s")
                if response.status_code >= 500 and attempt < 2:
                    time.sleep(0.5 * 2 ** attempt)
                    continue
                response.raise_for_status()
                self.last_success = utc_now()
                self.last_error = None
                return response.json()
            except requests.RequestException as exc:
                self.last_error = str(exc)
                if attempt == 2:
                    raise
                time.sleep(0.5 * 2 ** attempt)
        raise RuntimeError(f"{self.name} unavailable")

    @abstractmethod
    def fetch_current(self, city: dict) -> dict | None: ...

    @abstractmethod
    def fetch_history(self, city: dict, hours: int = 48) -> list[dict]: ...
