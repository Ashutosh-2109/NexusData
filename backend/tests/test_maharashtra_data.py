from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.build_maharashtra_data import add_stats, build, canonical_name
from engine.correlation import discover_correlations
import maharashtra_routes
from main import app


WORKBOOK = PROJECT_ROOT / "data/raw/Maharashtra_Combined_Datasets_Processed.xlsx"


def test_real_workbook_matching_blanks_and_reference_limits(tmp_path):
    meta = build(WORKBOOK, tmp_path)
    districts = json.loads((tmp_path / "districts.json").read_text(encoding="utf-8"))
    assert meta["counts"]["districts"] == 36
    assert meta["counts"]["indicator_district_matches"] == 36
    assert meta["counts"]["health_district_matches"] == 34
    by_name = {district["name"]: district for district in districts}
    for name in ["Mumbai City", "Mumbai Suburban"]:
        assert by_name[name]["metrics"]["health_sub_centres"] is None
        assert by_name[name]["metrics"]["total_reported_health_facilities"] is None
        assert "Brihan Mumbai" in by_name[name]["coverage_warning"]
    assert by_name["Palghar"]["metrics"]["population_2011"] is None
    assert "Thane" in by_name["Palghar"]["coverage_warning"]
    assert by_name["Mumbai Suburban"]["metrics"]["per_capita_income_source_units"] is None
    assert by_name["Mumbai Suburban"]["metrics"]["health_facilities_per_lakh"] is None
    assert meta["temporal_scope"].startswith("Cross-sectional snapshot")
    assert len(json.loads((tmp_path / "industry_regions.json").read_text())) == 12
    assert len(json.loads((tmp_path / "vehicle_offices.json").read_text())) == 49
    assert len(json.loads((tmp_path / "airports.json").read_text())) == 19
    assert len(json.loads((tmp_path / "census_series.json").read_text())) == 105


@pytest.mark.parametrize(
    "source,expected",
    [
        ("Ahmadnagar", "Ahilyanagar"),
        ("Aurangabad", "Chhatrapati Sambhajinagar"),
        ("Osmanabad", "Dharashiv"),
        ("Buldana", "Buldhana"),
        ("Gondiya", "Gondia"),
        ("Nanden", "Nanded"),
        ("Raigarh", "Raigad"),
        ("Bid", "Beed"),
        ("Mumbai", "Mumbai City"),
    ],
)
def test_specified_district_aliases(source, expected):
    assert canonical_name(source) == expected


def test_rank_percentile_and_median_math():
    districts = [
        {"name": "A", "metrics": {"score": 10}, "statistics": {}},
        {"name": "B", "metrics": {"score": 20}, "statistics": {}},
        {"name": "C", "metrics": {"score": None}, "statistics": {}},
    ]
    add_stats(districts, {"score": "Score"})
    assert districts[1]["statistics"]["score"] == {
        "rank": 1, "rank_label": "1st of 2", "districts_with_data": 2,
        "percentile": 100.0, "state_median": 15.0, "difference_from_median": 5.0,
    }
    assert districts[2]["statistics"]["score"] is None


def test_cross_sectional_correlation_reports_spearman_n_ci_and_bh():
    x = np.arange(18, dtype=float)
    frame = pd.DataFrame({"district": [f"D{i}" for i in range(18)], "x": x, "y": x ** 2, "z": x[::-1]})
    result = discover_correlations(frame, mode="cross_sectional", unit_key="district", bootstrap_samples=80)
    pair = next(item for item in result if {item["variable_a"], item["variable_b"]} == {"x", "y"})
    assert pair["analysis_unit"] == "district"
    assert pair["primary_measure"] == "Spearman's rho"
    assert pair["n"] == 18
    assert pair["spearman"] == 1.0
    assert pair["spearman_ci_95"][0] <= pair["spearman_ci_95"][1]
    assert pair["q_value_bh"] is not None
    assert "not causal" in pair["multiple_comparison_warning"]


def test_cross_sectional_requires_unique_district_keys():
    frame = pd.DataFrame({"district": ["A", "A"], "x": [1, 2], "y": [2, 4]})
    with pytest.raises(ValueError, match="unique"):
        discover_correlations(frame, mode="cross_sectional", unit_key="district")


def test_maharashtra_endpoints(tmp_path, monkeypatch):
    build(WORKBOOK, tmp_path)
    monkeypatch.setattr(maharashtra_routes, "DATA_DIR", tmp_path)
    geo_path = tmp_path / "geo.json"
    geo_path.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
    monkeypatch.setattr(maharashtra_routes, "GEO_PATH", geo_path)
    maharashtra_routes._json_file.cache_clear()
    maharashtra_routes._cross_sectional_analysis.cache_clear()
    try:
        client = TestClient(app)
        assert len(client.get("/api/maharashtra/districts").json()["districts"]) == 36
        assert client.get("/api/maharashtra/meta").json()["district_count"] == 36
        assert len(client.get("/api/maharashtra/rankings?metric=population_2011").json()["rankings"]) == 35
        assert len(client.get("/api/maharashtra/layers/industry").json()["items"]) == 12
        assert len(client.get("/api/maharashtra/layers/airports").json()["items"]) == 19
        assert len(client.get("/api/maharashtra/layers/vehicles").json()["items"]) == 49
        assert client.get("/api/maharashtra/geo").status_code == 200
        correlations = client.get("/api/maharashtra/correlations").json()
        assert correlations["district_count"] == 36
        assert correlations["primary_measure"] == "Spearman's rho"
        assert correlations["top_pairs"] and correlations["top_pairs"][0]["spearman_ci_95"]
    finally:
        maharashtra_routes._json_file.cache_clear()
        maharashtra_routes._cross_sectional_analysis.cache_clear()
