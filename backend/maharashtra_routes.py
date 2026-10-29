"""Maharashtra cross-sectional data and analysis API."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from engine.correlation import discover_correlations

router = APIRouter(prefix="/api/maharashtra", tags=["Maharashtra"])
DATA_DIR = Path(__file__).resolve().parent / "data" / "maharashtra"
GEO_PATH = Path(__file__).resolve().parents[1] / "frontend" / "public" / "data" / "maharashtra-districts.geojson"
LAYER_FILES = {
    "industry": "industry_regions.json",
    "airports": "airports.json",
    "vehicles": "vehicle_offices.json",
}


@lru_cache(maxsize=8)
def _json_file(name: str):
    path = DATA_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=503, detail=f"Maharashtra data file is unavailable: {name}")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/districts")
def districts():
    return {"districts": _json_file("districts.json")}


@router.get("/meta")
def metadata():
    return _json_file("meta.json")


@router.get("/geo")
def geography():
    if not GEO_PATH.is_file():
        return JSONResponse(status_code=503, content={"detail": "Maharashtra district boundary has not been built."})
    return JSONResponse(content=json.loads(GEO_PATH.read_text(encoding="utf-8")))


@router.get("/rankings")
def rankings(metric: str = Query(..., min_length=1)):
    rows = _json_file("districts.json")
    if not rows:
        return {"metric": metric, "rankings": []}
    if metric not in rows[0]["metrics"]:
        raise HTTPException(status_code=404, detail={"message": "Unknown metric", "available": sorted(rows[0]["metrics"])})
    valid = [row for row in rows if isinstance(row["metrics"].get(metric), (int, float))]
    valid.sort(key=lambda row: row["metrics"][metric], reverse=True)
    return {"metric": metric, "rankings": [
        {"district_id": row["id"], "district": row["name"], "value": row["metrics"][metric],
         **(row["statistics"].get(metric) or {})} for row in valid
    ]}


@router.get("/layers/{layer}")
def layer(layer: str):
    filename = LAYER_FILES.get(layer)
    if not filename:
        raise HTTPException(status_code=404, detail="Layer must be industry, airports, or vehicles")
    return {"layer": layer, "items": _json_file(filename)}


@lru_cache(maxsize=1)
def _cross_sectional_analysis() -> dict:
    rows = _json_file("districts.json")
    names = [row["name"] for row in rows]
    metric_keys = sorted({key for row in rows for key, value in row["metrics"].items()
                          if isinstance(value, (int, float)) and np.isfinite(value)})
    frame = pd.DataFrame([{ "district": row["name"], **row["metrics"] } for row in rows])
    frame[metric_keys] = frame[metric_keys].apply(pd.to_numeric, errors="coerce")
    results = discover_correlations(frame[["district", *metric_keys]], mode="cross_sectional", unit_key="district", min_samples=10)
    matrix = {key: {} for key in metric_keys}
    n_matrix = {key: {} for key in metric_keys}
    for key in metric_keys:
        matrix[key][key] = 1.0
        n_matrix[key][key] = int(frame[key].notna().sum())
    for item in results:
        a, b = item["variable_a"], item["variable_b"]
        matrix[a][b] = matrix[b][a] = item["spearman"]
        n_matrix[a][b] = n_matrix[b][a] = item["n"]
    for key in metric_keys:
        for other in metric_keys:
            matrix[key].setdefault(other, None)
            n_matrix[key].setdefault(other, int(frame[[key, other]].dropna().shape[0]))
    return {
        "analysis_unit": "district",
        "primary_measure": "Spearman's rho",
        "district_count": len(names),
        "metric_keys": metric_keys,
        "correlation_matrix": matrix,
        "n_matrix": n_matrix,
        "top_pairs": results[:30],
        "comparison_count": len(results),
        "warning": ("Cross-sectional snapshot; reference years vary or are unspecified. Pairwise n is shown and "
                    "95% bootstrap confidence intervals and BH-adjusted q values are reported. Multiple comparisons "
                    "are exploratory; correlation does not imply causation."),
    }


@router.get("/correlations")
def correlations():
    return _cross_sectional_analysis()
