# Decisions

- The city registry uses a fixed set of major Indian cities plus Vellore. Registry population and area are reference estimates, not live demographic measurements; pressure scoring treats density as a contextual proxy.
- Open-Meteo is the zero-key baseline. Keyed providers are optional overlays; a failed provider never blocks the baseline.
- A 15-minute cache reduces provider requests. Cached timestamps remain visible so the interface can distinguish fresh, stale, and offline data.
- Statistical projections are labeled indicative and never interpreted as causal effects.
