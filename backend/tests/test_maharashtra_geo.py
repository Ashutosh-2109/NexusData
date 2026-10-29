from pathlib import Path
import json

from shapely.geometry import Polygon
from scripts.build_maharashtra_geo import build


def test_geojson_has_all_joined_districts_and_stays_compact(tmp_path):
    destination = tmp_path / "districts.geojson"
    result = build(destination=destination)
    payload = json.loads(destination.read_text(encoding="utf-8"))
    assert result["district_polygons"] == 36
    assert result["matched_districts"] == 36
    assert len(payload["features"]) == 36
    assert destination.stat().st_size < 400_000
    assert len({feature["properties"]["id"] for feature in payload["features"]}) == 36
    for feature in payload["features"]:
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        for polygon in polygons:
            shape = Polygon(polygon[0], polygon[1:])
            assert shape.is_valid and shape.area > 0
            # d3-geo expects clockwise exterior rings to represent the intended district.
            assert not shape.exterior.is_ccw
