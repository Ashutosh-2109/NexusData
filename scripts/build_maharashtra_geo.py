"""Convert the licensed Survey of India KML listing into compact GeoJSON."""
from __future__ import annotations

import gzip
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable

try:
    from .build_maharashtra_data import DEFAULT_OUTPUT, canonical_name, slug
except ImportError:
    from build_maharashtra_data import DEFAULT_OUTPUT, canonical_name, slug
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data/raw/maharashtra_districts_source.kml.gz"
DEFAULT_DESTINATION = ROOT / "frontend/public/data/maharashtra-districts.geojson"
KML_NS = {"k": "http://www.opengis.net/kml/2.2"}
MAX_BYTES = 400_000


def simplify_ring(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker simplification in lon/lat, keeping closed and tiny rings valid."""
    if len(points) < 5:
        return points
    closed = points[0] == points[-1]
    source = points[:-1] if closed else points
    if len(source) <= 3:
        return points
    sq_tolerance = tolerance * tolerance
    keep = {0, len(source) - 1}
    stack = [(0, len(source) - 1)]
    while stack:
        start, end = stack.pop()
        ax, ay = source[start]
        bx, by = source[end]
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        best_distance, best_index = sq_tolerance, None
        for index in range(start + 1, end):
            px, py = source[index]
            if length_sq == 0:
                distance = (px - ax) ** 2 + (py - ay) ** 2
            else:
                amount = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
                distance = (px - (ax + amount * dx)) ** 2 + (py - (ay + amount * dy)) ** 2
            if distance > best_distance:
                best_distance, best_index = distance, index
        if best_index is not None:
            keep.add(best_index)
            stack.extend([(start, best_index), (best_index, end)])
    simplified = [source[index] for index in sorted(keep)]
    if len(simplified) < 3:
        return points
    if closed:
        simplified.append(simplified[0])
    return simplified


def parse_coordinates(node: ET.Element) -> list[list[float]]:
    coordinates = node.find("k:coordinates", KML_NS)
    if coordinates is None or not coordinates.text:
        return []
    result = []
    for token in coordinates.text.split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        result.append([float(parts[0]), float(parts[1])])
    return result


def polygons_for(placemark: ET.Element, tolerance: float) -> list[list[list[list[float]]]]:
    polygons = []
    for polygon in placemark.findall(".//k:Polygon", KML_NS):
        outer = polygon.find("k:outerBoundaryIs/k:LinearRing", KML_NS)
        if outer is None:
            continue
        exterior = parse_coordinates(outer)
        if len(exterior) < 4:
            continue
        holes = [parse_coordinates(inner) for inner in polygon.findall("k:innerBoundaryIs/k:LinearRing", KML_NS)]
        original = Polygon(exterior, [ring for ring in holes if len(ring) >= 4])
        shape = original.simplify(tolerance, preserve_topology=True)
        if shape.is_empty or shape.area <= 0 or not shape.is_valid:
            shape = original
        # d3-geo interprets RFC-7946 exterior winding as a spherical complement;
        # orient outer rings clockwise and holes counter-clockwise for its path engine.
        shape = orient(shape, sign=-1.0)
        simplified = [list(map(list, shape.exterior.coords))]
        simplified.extend([list(map(list, ring.coords)) for ring in shape.interiors])
        polygons.append(simplified)
    return polygons


def extract_properties(placemark: ET.Element) -> dict[str, str]:
    values = {element.attrib.get("name", ""): (element.text or "").strip()
              for element in placemark.findall(".//k:SimpleData", KML_NS)}
    return values


def build(source: Path = DEFAULT_SOURCE, destination: Path = DEFAULT_DESTINATION,
          districts_path: Path = DEFAULT_OUTPUT / "districts.json") -> dict:
    if not source.is_file():
        raise FileNotFoundError(f"Expected boundary KML at {source}")
    districts = json.loads(districts_path.read_text(encoding="utf-8"))
    expected = {row["name"]: row["id"] for row in districts}
    source_bytes = gzip.decompress(source.read_bytes()) if source.suffix == ".gz" else source.read_bytes()
    placemarks = ET.fromstring(source_bytes).findall(".//k:Placemark", KML_NS)
    if len(placemarks) != 36:
        raise ValueError(f"Expected 36 KML district polygons, found {len(placemarks)}")

    # Start with a detail-preserving tolerance and increase only until the contract is met.
    tolerance = 0.0005
    final = None
    while tolerance <= 0.02:
        features = []
        seen = set()
        for placemark in placemarks:
            source_name = extract_properties(placemark).get("District") or placemark.findtext("k:name", namespaces=KML_NS)
            name = canonical_name(source_name)
            if name not in expected:
                raise ValueError(f"Unmatched boundary name {source_name!r} -> {name!r}")
            if name in seen:
                raise ValueError(f"Duplicate boundary feature for {name}")
            seen.add(name)
            props = extract_properties(placemark)
            polygons = polygons_for(placemark, tolerance)
            if not polygons:
                raise ValueError(f"Boundary geometry collapsed for {name} at tolerance {tolerance}")
            geometry = {"type": "Polygon", "coordinates": polygons[0]} if len(polygons) == 1 else {"type": "MultiPolygon", "coordinates": polygons}
            features.append({"type": "Feature", "id": expected[name], "properties": {
                "id": expected[name], "name": name, "source_name": source_name,
                "soi_district_code": props.get("DISTRICT_L"), "state_lgd_code": props.get("State_LGD"),
            }, "geometry": geometry})
        if seen != set(expected):
            raise ValueError(f"Boundary join did not match 36 districts; missing={sorted(set(expected) - seen)}")
        payload = {"type": "FeatureCollection", "features": features}
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if len(encoded) <= MAX_BYTES:
            final = encoded
            break
        tolerance *= 1.5
    if final is None:
        raise ValueError("Could not simplify district geometry below 400 KB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(final + b"\n")
    return {"district_polygons": len(placemarks), "matched_districts": len(expected),
            "tolerance_degrees": tolerance, "bytes": len(final)}


if __name__ == "__main__":
    print(json.dumps(build(), sort_keys=True))
