"""Convert DataMeet Admin2.shp/dbf to a compact display GeoJSON.

Input files: https://github.com/datameet/maps/tree/master/States
The source state boundaries are CC BY 2.5 India; see docs/DATA_SOURCES.md.
"""
import json
import struct
import sys
from pathlib import Path

from shapely.geometry import Polygon


def dbf_names(path):
    data = Path(path).read_bytes()
    count, header_length, record_length = struct.unpack_from("<IHH", data, 4)
    names = []
    for i in range(count):
        record = data[header_length + i * record_length:header_length + (i + 1) * record_length]
        names.append(record[1:51].decode("latin1").strip())
    return names


def features(shp, names):
    data = Path(shp).read_bytes()
    position = 100
    for name in names:
        _, length = struct.unpack_from(">II", data, position)
        position += 8
        record = data[position:position + length * 2]
        position += length * 2
        shape_type = struct.unpack_from("<I", record, 0)[0]
        if shape_type != 5:
            continue
        parts_count, points_count = struct.unpack_from("<II", record, 36)
        part_offsets = struct.unpack_from(f"<{parts_count}I", record, 44)
        point_offset = 44 + parts_count * 4
        coordinates = []
        for start, end in zip(part_offsets, (*part_offsets[1:], points_count)):
            ring = [struct.unpack_from("<dd", record, point_offset + index * 16) for index in range(start, end)]
            if len(ring) < 4:
                continue
            polygon = Polygon(ring).simplify(0.04, preserve_topology=True)
            if polygon.is_empty or polygon.area < 0.0001:
                continue
            coordinates.append([[list(point) for point in polygon.exterior.coords]])
        if coordinates:
            yield {"type": "Feature", "properties": {"name": name},
                "geometry": {"type": "MultiPolygon", "coordinates": coordinates}}


if __name__ == "__main__":
    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    output = {"type": "FeatureCollection", "features": list(features(source / "Admin2.shp", dbf_names(source / "Admin2.dbf")))}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(output['features'])} states, {target.stat().st_size} bytes")
