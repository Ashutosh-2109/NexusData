"""Generate clearly synthetic Bengaluru electricity demand aligned with bundled 2026 samples."""
import csv
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

target = Path(__file__).resolve().parent.parent / "data" / "demo_load_overlap.csv"
start = datetime(2026, 7, 29, tzinfo=timezone.utc)
with target.open("w", newline="", encoding="utf-8") as output:
    writer = csv.writer(output)
    writer.writerow(["timestamp", "City", "load_MW"])
    for hour in range(15 * 24):
        instant = start + timedelta(hours=hour)
        daily = 240 * math.sin(2 * math.pi * ((hour % 24) - 7) / 24)
        writer.writerow([instant.isoformat().replace("+00:00", "Z"), "Bengaluru", round(1450 + daily + 0.8 * hour, 2)])
print(target)
