"""Transparent pressure scoring, evidence rules, and indicative scenarios."""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

from engine.correlation import discover_correlations

RULES = json.loads((Path(__file__).resolve().parent.parent / "data" / "interventions.json").read_text(encoding="utf-8"))
DEFAULT_WEIGHTS = {"air": 0.35, "heat": 0.25, "density": 0.20, "load": 0.20}


def weights() -> dict[str, float]:
    override = json.loads(os.getenv("DEVELOPMENT_WEIGHTS", "{}"))
    merged = {**DEFAULT_WEIGHTS, **override}
    if any(value < 0 for value in merged.values()) or sum(merged.values()) <= 0:
        raise ValueError("Development weights must be nonnegative and sum above zero")
    return merged


def _number(value):
    return float(value) if isinstance(value, (int, float)) and np.isfinite(value) else None


def _percentile(value, population):
    if value is None or not population:
        return None
    return 100 * sum(candidate <= value for candidate in population) / len(population)


def score_city(city: dict, history: list[dict], peers: list[dict] | None = None) -> dict:
    """Score only available inputs and renormalize their weights."""
    peers = peers or []
    metrics = history[-1].get("metrics", {}) if history else {}
    aqi = _number(metrics.get("aqi"))
    pm25 = _number(metrics.get("pm25"))
    temp_values = [_number(point.get("metrics", {}).get("temperature")) for point in history]
    temp_values = [value for value in temp_values if value is not None]
    load_values = [_number(point.get("metrics", {}).get("load_MW")) for point in history]
    load_values = [value for value in load_values if value is not None]
    density = city.get("population", 0) / max(city.get("area_km2", 1), 1)
    peer_aqi = [_number(p.get("current", {}).get("metrics", {}).get("aqi")) for p in peers if p.get("current")]
    peer_aqi = [value for value in peer_aqi if value is not None]
    air = _percentile(aqi, peer_aqi) if aqi is not None else min((pm25 or 0) / 90 * 100, 100) if pm25 is not None else None
    heat = min(max((max(temp_values) - 30) / 15 * 100, (10 - min(temp_values)) / 10 * 100, 0), 100) if temp_values else None
    density_score = min(density / 30000 * 100, 100) if city.get("population") and city.get("area_km2") else None
    load = min(max(load_values) / max(np.median(load_values), 1) * 50, 100) if len(load_values) >= 3 else None
    components = {"air": air, "heat": heat, "density": density_score, "load": load}
    active = {key: value for key, value in components.items() if value is not None}
    w = weights()
    denominator = sum(w[key] for key in active)
    score = round(sum(active[key] * w[key] for key in active) / denominator, 1) if denominator else None
    focus = []
    if pm25 is not None:
        focus.append({"area": "Air Quality", "severity": "high" if pm25 >= 90 else "moderate" if pm25 >= 35 else "low"})
    if temp_values and max(temp_values) >= 35:
        focus.append({"area": "Heat Stress", "severity": "high" if max(temp_values) >= 40 else "moderate"})
    if load_values and max(load_values) >= np.median(load_values) * 1.2:
        focus.append({"area": "Energy Demand", "severity": "high" if max(load_values) >= np.median(load_values) * 1.5 else "moderate"})
    return {"score": score, "components": {key: round(value, 1) if value is not None else None for key, value in components.items()},
        "focus_areas": focus, "weights": w, "density_per_km2": round(density, 1)}


def _patterns(history: list[dict], relationships: list[dict]) -> tuple[set[str], dict[str, list[str]]]:
    pm25_values = [_number(p.get("metrics", {}).get("pm25")) for p in history]
    pm25_values = [value for value in pm25_values if value is not None]
    patterns = set()
    evidence = {}
    if pm25_values:
        mean, peak = float(np.mean(pm25_values)), max(pm25_values)
        patterns.add("pm25_available")
        evidence["pm25_available"] = [f"Latest PM2.5: {pm25_values[-1]:.1f} µg/m³", f"Observed 48h mean: {mean:.1f} µg/m³"]
        if mean >= 35:
            patterns.add("pm25_elevated")
            evidence["pm25_elevated"] = [f"Observed 48h PM2.5 mean: {mean:.1f} µg/m³"]
        if peak > 35 and peak >= mean * 1.5:
            patterns.add("pm25_hourly_spike")
            evidence["pm25_hourly_spike"] = [f"Observed PM2.5 peak: {peak:.1f} µg/m³", f"48h mean: {mean:.1f} µg/m³"]
    temperatures = [_number(p.get("metrics", {}).get("temperature")) for p in history]
    temperatures = [value for value in temperatures if value is not None]
    if temperatures and max(temperatures) >= 35:
        patterns.add("temperature_extreme")
        evidence["temperature_extreme"] = [f"Observed 48h temperature maximum: {max(temperatures):.1f} °C"]
    for rel in relationships:
        if {rel.get("variable_a"), rel.get("variable_b")} == {"load_MW", "temperature"} and abs(rel.get("pearson") or 0) >= 0.6:
            patterns.add("load_temperature_correlation")
            evidence["load_temperature_correlation"] = [f"Load–temperature Pearson r: {rel['pearson']:.2f}", f"Paired samples: {rel['sample_count']}"]
    return patterns, evidence


def suggestions(score: dict, history: list[dict], relationships: list[dict]) -> list[dict]:
    patterns, evidence = _patterns(history, relationships)
    severities = {area["area"]: area["severity"] for area in score["focus_areas"]}
    output = []
    for rule in RULES["rules"]:
        if rule["pattern"] not in patterns or severities.get(rule["focus_area"]) not in rule["severity"]:
            continue
        output.append({**rule, "rule_id": rule["id"], "rule_version": RULES["version"], "evidence": evidence[rule["pattern"]]})
    return output


def scenario(history: list[dict], driver: str, target: str, change_percent: float) -> dict:
    if driver == target or not -100 <= change_percent <= 100:
        raise ValueError("Choose distinct variables and a change between -100% and 100%")
    frame = pd.DataFrame([point["metrics"] for point in history])
    if driver not in frame or target not in frame:
        raise ValueError("Selected variables are unavailable")
    pair = frame[[driver, target]].apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if len(pair) < 10 or pair[driver].std() == 0 or pair[target].std() == 0:
        raise ValueError("At least 10 variable observations are required")
    relationships = discover_correlations(pair, min_samples=10, prefer_cross_dataset=False)
    relationship = next((rel for rel in relationships if {rel["variable_a"], rel["variable_b"]} == {driver, target}), None)
    if not relationship:
        raise ValueError("No usable fitted relationship")
    slope, intercept = np.polyfit(pair[driver], pair[target], 1)
    baseline_driver = float(pair[driver].iloc[-1])
    baseline_target = float(pair[target].iloc[-1])
    proposed_driver = baseline_driver * (1 + change_percent / 100)
    projected_target = baseline_target + float(slope) * (proposed_driver - baseline_driver)
    return {"driver": driver, "target": target, "change_percent": change_percent,
        "baseline_driver": round(baseline_driver, 3), "proposed_driver": round(proposed_driver, 3),
        "baseline_target": round(baseline_target, 3), "projected_target": round(projected_target, 3),
        "slope": round(float(slope), 5), "intercept": round(float(intercept), 5),
        "pearson": relationship["pearson"], "sample_count": relationship["sample_count"],
        "label": "Indicative, correlation-based, not causal.",
        "limitations": "Assumes the observed linear association persists; ignores confounding, policy response, and extrapolation risk."}
