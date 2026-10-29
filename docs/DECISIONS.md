# Decisions

- The city registry uses a fixed set of major Indian cities plus Vellore. Registry population and area are reference estimates, not live demographic measurements; pressure scoring treats density as a contextual proxy.
- Open-Meteo is the zero-key baseline. Keyed providers are optional overlays; a failed provider never blocks the baseline.
- A 15-minute cache reduces provider requests. Cached timestamps remain visible so the interface can distinguish fresh, stale, and offline data.
- Statistical projections are labeled indicative and never interpreted as causal effects.
- The original `data/load_data.csv` sample remains available through `/api/sample-files` alongside `data/demo_load_overlap.csv`. The default sample-loading flow now uses the overlapping demo because the original sample's dates do not overlap the AQI/weather examples; the original file was retained for existing workflows. This was checked against `feature/insight-graph-and-visualizations` and no sample file deletion was necessary.
- The Maharashtra workbook is copied unchanged to `data/raw/` and parsed only from the specified analysis sheets. The 55 source-register sheets are not loaded into the analysis output.
- Master-sheet blanks remain JSON `null`; Brihan Mumbai health counts are not allocated to Mumbai City or Mumbai Suburban, and Palghar receives no historic Thane census values. The supplied 36-row master is authoritative for district indicators; validations require 36/36 indicator matches and 34 individual health matches.
- Cross-sectional ranks are descending (rank 1 is the largest value), percentiles increase with value, and median differences are value minus the median among districts with data. These descriptive ranks are not performance grades.
- Health facilities per lakh is derived only when reported facilities and the workbook's 2011 population are both present. Statistical pair tests report pairwise n, a deterministic 500-resample percentile bootstrap interval, and Benjamini-Hochberg adjusted q values; the snapshot's reference years vary or are unspecified, so comparisons remain exploratory and non-causal.
