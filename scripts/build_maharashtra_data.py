"""Build reproducible, analysis-ready JSON from the supplied Maharashtra workbook."""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "data/raw/Maharashtra_Combined_Datasets_Processed.xlsx"
DEFAULT_OUTPUT = ROOT / "backend/data/maharashtra"
MASTER_SHEET = "DISTRICT Master"

# Explicit aliases from QUALITY & MATCHING plus spellings in the 2025 SOI KML.
ALIASES = {
    "ahmadnagar": "Ahilyanagar", "ahamednagar": "Ahilyanagar", "ahamadnagar": "Ahilyanagar",
    "amaravati": "Amravati", "aurangabad": "Chhatrapati Sambhajinagar",
    "chhatrapti sambhajinagar": "Chhatrapati Sambhajinagar",
    "osmanabad": "Dharashiv", "usmanabad": "Dharashiv", "buldana": "Buldhana", "gondiya": "Gondia",
    "nanden": "Nanded", "raigarh": "Raigad", "raygad": "Raigad", "bid": "Beed", "b|d": "Beed",
    "mumbai": "Mumbai City", "sub urban mumbai": "Mumbai Suburban", "suburban mumbai": "Mumbai Suburban",
    "wash|m": "Washim",
}

MASTER_UNITS = {
    "Population 2011": ("people", "Census 2011 count; Palghar has no separate 2011 row in the supplied workbook."),
    "Population 2001": ("people", "Census 2001 count on historical boundaries; do not treat as current district population."),
    "Population 1991": ("people", "Census 1991 count on historical boundaries; blanks are not zero."),
    "Population growth 2001-11": ("fraction", "Workbook-derived 2001–2011 growth; historical boundaries and dates vary."),
    "Density 2011": ("people/km²", "Census 2011 density; Palghar is blank because no separate 2011 district row exists."),
    "Literacy 2011 (%)": ("%", "Census 2011; not a current-year estimate."),
    "Health sub-centres": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "Primary health centres": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "Dispensaries": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "Sub-district hospitals": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "District hospitals": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "General hospitals": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "Women hospitals": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "Rural hospitals": ("facilities", "Health sheet combines Brihan Mumbai; Mumbai City/Suburban are intentionally blank."),
    "Total reported health facilities": ("facilities", "Sum of reported facility types only; blank combined-Mumbai districts remain unknown."),
    "Schools per 10 sq km": ("schools/10 km²", "Source indicator; reference year is unspecified."),
    "Secondary dropout (%)": ("%", "Secondary IX–X dropout; reference year is unspecified."),
    "Forest land (%)": ("%", "Reference year is unspecified; source coverage may vary."),
    "Domestic electricity kWh per capita": ("kWh/person", "Reference year is unspecified; source units preserved."),
    "Industrial electricity kWh per capita": ("kWh/person", "Reference year is unspecified; source units preserved."),
    "Per capita income (source units)": ("source units", "Current-price source value; currency/year metadata is not supplied."),
    "Vehicles per lakh": ("vehicles/100,000 people", "Stock/reference year is unspecified; not a monthly registration flow."),
    "Underweight severe (%)": ("%", "Children age 0–5; reference year is unspecified."),
    "Underweight moderate (%)": ("%", "Children age 0–5; reference year is unspecified."),
}
DERIVED_UNITS = {
    "health_facilities_per_lakh": {
        "label": "Health facilities per lakh population", "unit": "facilities/100,000 people",
        "source_sheet": MASTER_SHEET,
        "caveat": "Derived from reported facilities and Population 2011. Not computed where health coverage or population is missing; population is from 2011.",
    }
}

TABLE_RULES = {
    "DATA Health Facilities": "Use district rows only. Exclude divisions/state totals. Brihan Mumbai is combined and is never split between Mumbai City and Mumbai Suburban.",
    "DATA Industry MPCB": "Keep MPCB regions separate; they are not administrative districts. Exclude state total.",
    "DATA Vehicle Categories": "Keep office/local-area rows only; exclude region subtotals to avoid double counting. These are stocks, not monthly flows.",
    "DATA Airport Traffic": "Keep airport rows only; exclude domestic/international section totals and grand total.",
    "DATA Census Wide": "Historical census boundaries do not include separate Palghar; never attribute old Thane counts to Palghar.",
    "CENSUS Yearly": "Historical district counts are retained for the sparkline; blank values are unknown and boundaries change over time.",
    "DATA District Indicators": "Keep district rows only; exclude footnotes. Reference year is unspecified.",
    "DATA Census Wide": "2011 district counts follow historical boundaries; Palghar is not separately represented.",
}


def slug(value: str) -> str:
    value = value.strip().lower().replace("%", " percent ").replace("²", "2")
    return re.sub(r"[^a-z0-9]+", "_", value).strip("_")


def canonical_name(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = re.sub(r"\s+", " ", str(value).strip())
    if not text or text.lower() in {"brihan mumbai", "mumbai (combined)", "mumbai city and suburban"}:
        return None
    return ALIASES.get(text.casefold(), text.title())


def to_json_value(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return float(value) if math.isfinite(float(value)) else None
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, str):
        text = value.strip()
        if not text or text.casefold() in {"-", "n.a.", "na", "n/a", "neg"}:
            return None
        numeric = text.replace(",", "").replace("₹", "").strip()
        try:
            parsed = float(numeric)
            return int(parsed) if parsed.is_integer() else parsed
        except ValueError:
            return text
    return value


def read_table(book: pd.ExcelFile, sheet: str) -> pd.DataFrame:
    return pd.read_excel(book, sheet_name=sheet, header=4, dtype=object)


def table_rows(frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    for _, row in frame.iterrows():
        clean = {str(column): to_json_value(value) for column, value in row.items()}
        if any(value is not None for value in clean.values()):
            rows.append(clean)
    return rows


def add_stats(districts: list[dict[str, Any]], metrics: dict[str, str]) -> None:
    for key, header in metrics.items():
        pairs = [(d, d["metrics"].get(key)) for d in districts]
        values = [value for _, value in pairs if isinstance(value, (int, float)) and math.isfinite(value)]
        if not values:
            continue
        median = float(np.median(values))
        ordered = sorted(values, reverse=True)
        n = len(ordered)
        for district, value in pairs:
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                district["statistics"][key] = None
                continue
            greater = sum(item > value for item in ordered)
            ties = sum(item == value for item in ordered)
            rank = greater + 1
            average_rank = greater + (ties + 1) / 2
            percentile = 100.0 if n <= 1 else 100 * (n - average_rank) / (n - 1)
            district["statistics"][key] = {
                "rank": rank,
                "rank_label": f"{rank}{'st' if rank % 10 == 1 and rank % 100 != 11 else 'nd' if rank % 10 == 2 and rank % 100 != 12 else 'rd' if rank % 10 == 3 and rank % 100 != 13 else 'th'} of {n}",
                "districts_with_data": n,
                "percentile": round(percentile, 1),
                "state_median": median,
                "difference_from_median": round(float(value) - median, 4),
            }


def field_dictionary(master: pd.DataFrame, indicators: pd.DataFrame, health: pd.DataFrame,
                     census: pd.DataFrame, census_wide: pd.DataFrame, industry: pd.DataFrame, vehicles: pd.DataFrame,
                     airports: pd.DataFrame) -> dict[str, dict[str, str]]:
    dictionary: dict[str, dict[str, str]] = {}
    for header in master.columns:
        header = str(header)
        if header in {"District", "Join / coverage warning"}:
            unit = "district name" if header == "District" else "text"
        elif header in {"Census match", "Health match"}:
            unit = "match status"
        else:
            unit = MASTER_UNITS.get(header, ("not specified", ""))[0]
        dictionary[slug(header)] = {
            "label": header, "unit": unit, "source_sheet": MASTER_SHEET,
            "caveat": MASTER_UNITS.get(header, (unit, "Reference years vary or are unspecified; supplied values are not independently authenticated."))[1],
        }
    sheets = [
        ("DATA District Indicators", indicators), ("DATA Health Facilities", health),
        ("CENSUS Yearly", census), ("DATA Census Wide", census_wide), ("DATA Industry MPCB", industry),
        ("DATA Vehicle Categories", vehicles), ("DATA Airport Traffic", airports),
    ]
    for sheet, frame in sheets:
        for header in frame.columns:
            header = str(header)
            if header in {"Notes", "Row type"}:
                unit = "text"
            elif "district" in header.casefold() or "region" in header.casefold() or "office" in header.casefold() or "airport" in header.casefold():
                unit = "category"
            elif "%" in header or "percentage" in header.casefold() or "rate" in header.casefold():
                unit = "%"
            elif "per lakh" in header.casefold():
                unit = "per 100,000 people"
            elif "lakhs" in header.casefold():
                unit = "lakhs"
            elif "kwh" in header.casefold():
                unit = "kWh (source units)"
            elif "density" in header.casefold():
                unit = "per km²"
            elif "sex ratio" in header.casefold():
                unit = "females per 1,000 males"
            elif "population" in header.casefold() or "movement" in header.casefold() or "passenger" in header.casefold() or "cargo" in header.casefold() or any(word in header.casefold() for word in ["sub-centres", "centres", "hospitals", "dispensaries", "vehicles", "buses", "cars", "taxis", "tractors", "total"]):
                unit = "count / source unit"
            else:
                unit = "source unit not specified"
            key = f"{slug(sheet)}__{slug(header)}"
            dictionary[key] = {"label": header, "unit": unit, "source_sheet": sheet,
                               "caveat": TABLE_RULES.get(sheet, "Reference years vary or are unspecified; source has not been independently authenticated.")}
    return dictionary


def extract_quality_rules(book: pd.ExcelFile) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    frame = pd.read_excel(book, sheet_name="QUALITY & MATCHING", header=None, dtype=object)
    summary: list[dict[str, Any]] = []
    rules: list[dict[str, Any]] = []
    section = ""
    for _, row in frame.iterrows():
        values = [to_json_value(value) for value in row.tolist()]
        values = [value for value in values if value is not None]
        if not values:
            continue
        first = str(values[0])
        if first == "Dataset" and len(values) > 1:
            section = "summary"
            continue
        if first == "Harmonization / exception":
            section = "rules"
            continue
        if first in {"PROVENANCE", "NOT A SUBSTITUTE", "SOURCE VALIDATION", "DISTRICT MASTER"}:
            section = first.casefold().replace(" ", "_")
        if section == "summary" and len(values) >= 5:
            summary.append({"dataset": values[0], "source_rows": values[1], "analysis_rows": values[2],
                            "excluded_rows": values[3], "interpretation": values[4]})
        elif section == "rules" and len(values) >= 3:
            rules.append({"source_or_rule": values[0], "applied_rule": values[1], "reason": values[2],
                          "result": values[3] if len(values) > 3 else None})
        elif section not in {"summary", "rules"}:
            rules.append({"source_or_rule": first, "applied_rule": "Data note", "reason": " ".join(map(str, values[1:])), "result": None})
    return summary, rules


def build(workbook: Path = DEFAULT_WORKBOOK, output_dir: Path = DEFAULT_OUTPUT) -> dict[str, Any]:
    if not workbook.is_file():
        raise FileNotFoundError(f"Expected workbook at {workbook}")
    book = pd.ExcelFile(workbook)
    required = ["DISTRICT Master", "CENSUS Yearly", "DATA Census Wide", "DATA District Indicators",
                "DATA Health Facilities", "DATA Industry MPCB", "DATA Vehicle Categories",
                "DATA Airport Traffic", "QUALITY & MATCHING"]
    missing_sheets = [name for name in required if name not in book.sheet_names]
    if missing_sheets:
        raise ValueError(f"Workbook is missing required sheets: {', '.join(missing_sheets)}")

    frames = {name: read_table(book, name) for name in required if name != "QUALITY & MATCHING"}
    master = frames[MASTER_SHEET].dropna(subset=["District"]).copy()
    master["District"] = master["District"].map(canonical_name)
    if len(master) != 36 or master["District"].nunique() != 36:
        raise ValueError(f"Expected 36 unique district rows, found {len(master)} rows/{master['District'].nunique()} names")
    district_names = set(master["District"])

    indicators = frames["DATA District Indicators"]
    indicator_rows = indicators[indicators["Row type"].astype(str).str.casefold() == "district"].copy()
    indicator_rows["__canonical"] = indicator_rows["District (source)"].map(canonical_name)
    indicator_unmatched = sorted(str(v) for v in indicator_rows.loc[~indicator_rows["__canonical"].isin(district_names), "District (source)"].unique())
    indicator_joined = indicator_rows[indicator_rows["__canonical"].isin(district_names)]
    if indicator_unmatched or set(indicator_joined["__canonical"]) != district_names or len(indicator_joined) != 36:
        raise ValueError(f"District indicator matching failed (expected 36/36); unmatched={indicator_unmatched}")

    health = frames["DATA Health Facilities"]
    health_districts = health[health["Row type"].astype(str).str.casefold() == "district / combined district"].copy()
    health_districts["__canonical"] = health_districts["District (source)"].map(canonical_name)
    health_unmatched = sorted(str(v) for v in health_districts.loc[health_districts["__canonical"].isna(), "District (source)"].unique())
    health_matched = health_districts[health_districts["__canonical"].isin(district_names)]
    if len(health_matched) != 34 or set(health_matched["__canonical"]) != district_names - {"Mumbai City", "Mumbai Suburban"}:
        raise ValueError(f"Expected 34 individual health matches; got {len(health_matched)}; unmatched combined rows={health_unmatched}")

    census = frames["CENSUS Yearly"].dropna(subset=["District (standard)", "Census year"]).copy()
    census["District (standard)"] = census["District (standard)"].map(canonical_name)
    census_unmatched = sorted(str(v) for v in census.loc[~census["District (standard)"].isin(district_names), "District (source)"].unique())
    if census_unmatched:
        raise ValueError(f"Census series contains unmatched district names: {census_unmatched}")
    census_wide = frames["DATA Census Wide"].dropna(subset=["District (standard)"]).copy()
    census_wide["District (standard)"] = census_wide["District (standard)"].map(canonical_name)
    if len(census_wide) != 35 or census_wide["District (standard)"].duplicated().any() or not set(census_wide["District (standard)"]).issubset(district_names):
        raise ValueError("DATA Census Wide must contain 35 unique matched districts and omit Palghar, without fabricating a split.")

    # All master numeric fields carry the rank/percentile/median metadata used by the UI.
    master_fields = [str(column) for column in master.columns if column != "District"]
    districts: list[dict[str, Any]] = []
    for _, row in master.iterrows():
        name = str(row["District"])
        metrics = {slug(field): to_json_value(row[field]) for field in master_fields}
        warning = metrics.pop("join_coverage_warning", None)
        facility_count = metrics.get("total_reported_health_facilities")
        population = metrics.get("population_2011")
        metrics["health_facilities_per_lakh"] = round(facility_count / population * 100_000, 3) if isinstance(facility_count, (int, float)) and isinstance(population, (int, float)) and population > 0 else None
        source_indicator = indicator_joined[indicator_joined["__canonical"] == name]
        indicator_record = table_rows(source_indicator.drop(columns=["__canonical"]))[0]
        health_source = health_matched[health_matched["__canonical"] == name]
        health_record = table_rows(health_source.drop(columns=["__canonical"]))[0] if not health_source.empty else None
        history_rows = census[census["District (standard)"] == name].sort_values("Census year")
        history = [{"year": int(to_json_value(r["Census year"])), "population": to_json_value(r["Population"]),
                    "literacy_percent": to_json_value(r["Literacy rate (%)"]), "density_per_km2": to_json_value(r["Density (persons per sq km)"]),
                    "source_district": to_json_value(r["District (source)"]), "note": to_json_value(r["Data note"])}
                   for _, r in history_rows.iterrows()]
        districts.append({"id": slug(name), "name": name, "metrics": metrics, "statistics": {},
                          "coverage_warning": warning, "source_indicator_details": indicator_record,
                          "source_health_detail": health_record, "census_series": history})

    # Excel sometimes stores numbers in mixed object columns; infer numeric fields by cell values.
    numeric_metrics = {key: header for key, header in zip([slug(field) for field in master_fields], master_fields)
                       if pd.to_numeric(master[header], errors="coerce").notna().any()}
    numeric_metrics["health_facilities_per_lakh"] = "Health facilities per lakh population"
    add_stats(districts, numeric_metrics)

    table_specs = {
        "industry_regions": (frames["DATA Industry MPCB"], "Row type", {"region"}, "DATA Industry MPCB"),
        "vehicle_offices": (frames["DATA Vehicle Categories"], "Row type", {"office / local area"}, "DATA Vehicle Categories"),
        "airports": (frames["DATA Airport Traffic"], "Row type", {"airport"}, "DATA Airport Traffic"),
    }
    tables: dict[str, list[dict[str, Any]]] = {}
    counts = {"districts": len(districts), "indicator_district_matches": len(indicator_joined),
              "health_district_matches": len(health_matched), "excluded_health_combined_rows": len(health_unmatched),
              "census_districts": int(census["District (standard)"].nunique()), "census_rows": len(census),
              "census_wide_districts": int(census_wide["District (standard)"].nunique())}
    for output_name, (frame, type_column, allowed_types, source_sheet) in table_specs.items():
        filtered = frame[frame[type_column].astype(str).str.casefold().isin(allowed_types)]
        tables[output_name] = table_rows(filtered)
        counts[output_name] = len(filtered)
    tables["census_series"] = []
    for _, row in census.iterrows():
        tables["census_series"].extend(table_rows(pd.DataFrame([row])))

    dictionary = field_dictionary(master, indicators, frames["DATA Health Facilities"], frames["CENSUS Yearly"],
                                  frames["DATA Census Wide"],
                                  frames["DATA Industry MPCB"], frames["DATA Vehicle Categories"], frames["DATA Airport Traffic"])
    dictionary.update(DERIVED_UNITS)
    quality_summary, quality_rules = extract_quality_rules(book)
    meta = {
        "title": "Maharashtra district reference indicators",
        "source_workbook": workbook.name,
        "source_note": "User-supplied workbook; source publishers and update dates have not been independently authenticated.",
        "temporal_scope": "Cross-sectional snapshot. Reference years vary or are unspecified; fields do not share a common year.",
        "district_count": 36,
        "district_ids": [{"id": d["id"], "name": d["name"]} for d in districts],
        "counts": counts,
        "alias_table": ALIASES,
        "excluded_rows": {"industry_state_total": 1, "vehicle_region_subtotals": 14, "airport_section_and_grand_totals": 3,
                          "health_division_and_state_totals": 7, "district_indicator_footnotes": 1,
                          "brihan_mumbai_combined_health": 1},
        "quality_summary": quality_summary,
        "quality_rules": quality_rules,
        "statistics_note": "Ranks are descending (rank 1 is the largest value), percentile increases with the value, and difference is value minus the median of districts with data. These are descriptive reference statistics, not performance grades.",
        "data_dictionary": dictionary,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    payloads = {"districts.json": districts, "meta.json": meta, "data_dictionary.json": dictionary,
                **{f"{name}.json": records for name, records in tables.items()}}
    for filename, payload in payloads.items():
        (output_dir / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        meta = build(args.workbook, args.output)
    except Exception as exc:
        print(f"Maharashtra data build failed: {exc}", file=sys.stderr)
        raise
    print(json.dumps(meta["counts"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
