from pathlib import Path
import json

from scripts.build_maharashtra_geo import build

ROOT = Path(__file__).resolve().parents[2]


def test_geojson_has_all_joined_districts_and_stays_compact(tmp_path):
    destination = tmp_path / "districts.geojson"
    result = build(destination=destination)
    payload = json.loads(destination.read_text(encoding="utf-8"))
    assert result["district_polygons"] == 36
    assert result["matched_districts"] == 36
    assert len(payload["features"]) == 36
    assert destination.stat().st_size < 400_000
    assert len({feature["properties"]["id"] for feature in payload["features"]}) == 36
