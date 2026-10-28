# Development insights methodology

NexusData scores **observed pressure in its available data**, not overall development or policy performance. All output is indicative.

## Pressure score

Each available component is scaled to 0–100. The total is the weighted mean of available components; missing components are omitted and the remaining weights are renormalized. Defaults are `air=0.35`, `heat=0.25`, `density=0.20`, `load=0.20`. Override with a JSON object in `DEVELOPMENT_WEIGHTS`.

- **Air:** percentile of the city's latest model-derived Indian AQI among cities with data. If AQI is missing but PM2.5 is present, `min(PM2.5 / 90 × 100, 100)`.
- **Heat:** `min(100, max(0, (48h maximum °C − 30) / 15 × 100, (10 − 48h minimum °C) / 10 × 100))`.
- **Density:** `min(100, (registry population / registry area km²) / 30,000 × 100)`. Registry figures are reference estimates; this is a contextual proxy.
- **Load:** when at least three load readings exist, `min(100, 48h peak / 48h median × 50)`.

The air component is relative to cities in the registry, so its value can change when coverage changes. A score is not comparable to an official index.

## Focus areas and suggestions

Air Quality is low/moderate/high at latest PM2.5 below 35 / 35–89 / 90+ µg/m³. Heat Stress is moderate at a 48h maximum of 35–39.9 °C and high at 40+ °C. Energy Demand is moderate at a peak at least 1.2× the 48h median and high at 1.5×. These are exploratory thresholds, not regulatory classifications.

Rules in `backend/data/interventions.json` are versioned. Each rule requires a focus area, severity, and measured pattern. The API returns the observed numbers, rule ID and version, expected direction, confidence, and limitations. A basic PM2.5 monitoring suggestion is available even when concentrations are low. A suggested action does not establish a causal effect.

## Indian AQI estimate

Open-Meteo does not report India's national AQI. NexusData estimates subindices from model PM2.5, PM10, and NO₂ using CPCB concentration breakpoints and at least 18 hourly values in the previous 24 hours for each pollutant. It takes the maximum subindex, as in the CPCB method. The result is labeled **model-derived Indian AQI estimate**. It is not an official CPCB station AQI, and the limited pollutant set can miss a higher index from another pollutant. WAQI's reported AQI is kept separate because its scale may differ.

## Scenario projection

For two numeric series with at least 10 aligned pairs, the correlation engine identifies the relationship. A least-squares slope then projects `target_new = target_latest + slope × (driver_latest × change_percent / 100)`. It is labeled **indicative, correlation-based, not causal**. It assumes the fitted association persists and does not model confounders or intervention effects.
