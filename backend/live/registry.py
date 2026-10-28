"""Canonical city names shared by live lookups and CSV harmonization."""
import json
from pathlib import Path
from thefuzz import process

CITIES = json.loads((Path(__file__).resolve().parent.parent / "data" / "cities.json").read_text(encoding="utf-8"))
CITY_BY_NAME = {city["name"].lower(): city for city in CITIES}
ALIASES = {alias.lower(): city["name"] for city in CITIES for alias in [city["name"], *city.get("aliases", [])]}


def canonical_city(name: str) -> str | None:
    cleaned = name.strip().lower()
    if cleaned in ALIASES:
        return ALIASES[cleaned]
    match = process.extractOne(cleaned, list(ALIASES)) if cleaned else None
    return ALIASES[match[0]] if match and match[1] >= 90 else None


def get_city(name: str) -> dict | None:
    canonical = canonical_city(name)
    return CITY_BY_NAME.get(canonical.lower()) if canonical else None
