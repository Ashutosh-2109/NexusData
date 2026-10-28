"""SQLite persistence with process-memory fallback at call sites."""
from __future__ import annotations

import io
import json
import logging
import os
import sqlite3
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)
DEFAULT_PATH = Path(__file__).resolve().parent / "storage" / "nexusdata.sqlite"


def db_path() -> Path:
    return Path(os.getenv("NEXUSDATA_DB_PATH", str(DEFAULT_PATH)))


def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=5)
    connection.execute("CREATE TABLE IF NOT EXISTS merged_dataset (id INTEGER PRIMARY KEY CHECK (id=1), frame_json TEXT NOT NULL, summaries_json TEXT NOT NULL)")
    connection.execute("CREATE TABLE IF NOT EXISTS live_history (city TEXT NOT NULL, time TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (city,time,source))")
    return connection


def save_merged(df: pd.DataFrame, summaries: list[dict]):
    try:
        frame_json = df.to_json(orient="table", date_format="iso")
        with connect() as db:
            db.execute("INSERT OR REPLACE INTO merged_dataset VALUES (1,?,?)", (frame_json, json.dumps(summaries)))
    except Exception as exc:
        logger.warning("Merged dataset persistence unavailable: %s", exc)


def load_merged():
    try:
        with connect() as db:
            row = db.execute("SELECT frame_json, summaries_json FROM merged_dataset WHERE id=1").fetchone()
        if row:
            return pd.read_json(io.StringIO(row[0]), orient="table"), json.loads(row[1])
    except Exception as exc:
        logger.warning("Merged dataset restore unavailable: %s", exc)
    return None, None


def save_live(bundles: dict[str, dict]):
    try:
        rows = [(point["city"], point["time"], point["source"], json.dumps(point))
            for bundle in bundles.values() for point in bundle.get("history", [])]
        with connect() as db:
            db.executemany("INSERT OR REPLACE INTO live_history VALUES (?,?,?,?)", rows)
    except Exception as exc:
        logger.warning("Live history persistence unavailable: %s", exc)


def load_live(hours=48):
    try:
        with connect() as db:
            rows = db.execute("SELECT city,payload_json FROM (SELECT city,payload_json, ROW_NUMBER() OVER (PARTITION BY city ORDER BY time DESC) AS rn FROM live_history) WHERE rn <= ? ORDER BY city,rn", (hours,)).fetchall()
        grouped = {}
        for city, payload in rows:
            if len(grouped.get(city, [])) < hours:
                grouped.setdefault(city, []).append(json.loads(payload))
        return {city: {"history": list(reversed(points)), "current": points[0] if points else None}
            for city, points in grouped.items()}
    except Exception as exc:
        logger.warning("Live history restore unavailable: %s", exc)
        return {}
