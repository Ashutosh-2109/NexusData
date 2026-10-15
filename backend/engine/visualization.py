import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from scipy import stats

def get_scatter_data(
    df: pd.DataFrame,
    x_var: str,
    y_var: str,
    max_points: int = 1000
) -> Dict[str, Any]:
    """
    Extracts scatter plot data for two numerical variables.
    Computes Pearson, Spearman, sample count, and linear regression parameters.
    Downsamples points sensibly if observation count exceeds max_points.
    """
    if df is None or df.empty:
        raise ValueError("No active dataset available.")
    
    if x_var not in df.columns:
        raise ValueError(f"Variable '{x_var}' not found in dataset.")
    if y_var not in df.columns:
        raise ValueError(f"Variable '{y_var}' not found in dataset.")

    # Select columns
    cols = [x_var, y_var]
    has_time = 'Standardized_Time' in df.columns
    has_loc = 'Standardized_Location' in df.columns
    if has_time:
        cols.append('Standardized_Time')
    if has_loc:
        cols.append('Standardized_Location')

    sub_df = df[cols].copy()
    
    # Coerce to numeric
    sub_df[x_var] = pd.to_numeric(sub_df[x_var], errors='coerce')
    sub_df[y_var] = pd.to_numeric(sub_df[y_var], errors='coerce')
    
    # Drop rows with NaN or Inf in either x or y
    valid_mask = sub_df[x_var].notnull() & sub_df[y_var].notnull() & np.isfinite(sub_df[x_var]) & np.isfinite(sub_df[y_var])
    valid_df = sub_df[valid_mask].copy()

    total_valid_samples = len(valid_df)
    if total_valid_samples < 2:
        return {
            "x_var": x_var,
            "y_var": y_var,
            "sample_count": total_valid_samples,
            "pearson": None,
            "spearman": None,
            "regression": None,
            "points": []
        }

    x_vals = valid_df[x_var].values
    y_vals = valid_df[y_var].values

    # Correlation metrics
    pearson_r = None
    spearman_rho = None
    
    try:
        if np.std(x_vals) > 0 and np.std(y_vals) > 0:
            pr, _ = stats.pearsonr(x_vals, y_vals)
            if not np.isnan(pr):
                pearson_r = round(float(pr), 4)

            sr, _ = stats.spearmanr(x_vals, y_vals)
            if not np.isnan(sr):
                spearman_rho = round(float(sr), 4)
    except Exception:
        pass

    # Linear Regression (y = mx + b)
    regression = None
    try:
        if np.std(x_vals) > 0:
            slope, intercept, r_val, p_val, std_err = stats.linregress(x_vals, y_vals)
            if not np.isnan(slope) and not np.isnan(intercept):
                x_min = float(np.min(x_vals))
                x_max = float(np.max(x_vals))
                regression = {
                    "slope": round(float(slope), 5),
                    "intercept": round(float(intercept), 5),
                    "r_squared": round(float(r_val**2), 4) if not np.isnan(r_val) else 0.0,
                    "x_min": round(x_min, 4),
                    "x_max": round(x_max, 4),
                    "y_at_xmin": round(float(slope * x_min + intercept), 4),
                    "y_at_xmax": round(float(slope * x_max + intercept), 4)
                }
    except Exception:
        pass

    # Downsample points for frontend visualization performance if needed
    if total_valid_samples > max_points:
        sampled_df = valid_df.sample(n=max_points, random_state=42)
    else:
        sampled_df = valid_df

    points = []
    for _, row in sampled_df.iterrows():
        pt = {
            "x": round(float(row[x_var]), 4),
            "y": round(float(row[y_var]), 4)
        }
        if has_time and pd.notnull(row.get('Standardized_Time')):
            pt["time"] = str(row['Standardized_Time'])[:16]
        if has_loc and pd.notnull(row.get('Standardized_Location')):
            pt["location"] = str(row['Standardized_Location'])
        points.append(pt)

    return {
        "x_var": x_var,
        "y_var": y_var,
        "sample_count": total_valid_samples,
        "displayed_points": len(points),
        "pearson": pearson_r,
        "spearman": spearman_rho,
        "regression": regression,
        "points": points
    }

def get_timeseries_data(
    df: pd.DataFrame,
    variable: str,
    location: Optional[str] = None,
    aggregation: str = "1h",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    max_points: int = 1500
) -> Dict[str, Any]:
    """
    Extracts time-series data for a selected numerical variable against Standardized_Time.
    Preserves null gaps without fabricating missing data.
    Aggregates dynamically (1h, 1d, 7d, 1M).
    """
    if df is None or df.empty:
        raise ValueError("No active dataset available.")

    if 'Standardized_Time' not in df.columns:
        raise ValueError("Dataset does not have a 'Standardized_Time' axis.")

    if variable not in df.columns:
        raise ValueError(f"Variable '{variable}' not found in dataset.")

    # Filter by location if specified
    sub_df = df.copy()
    if location and location != 'all' and 'Standardized_Location' in sub_df.columns:
        sub_df = sub_df[sub_df['Standardized_Location'].astype(str).str.lower() == location.lower()]

    # Ensure Standardized_Time is datetime
    sub_df['Standardized_Time'] = pd.to_datetime(sub_df['Standardized_Time'], errors='coerce')
    sub_df = sub_df.dropna(subset=['Standardized_Time'])
    sub_df[variable] = pd.to_numeric(sub_df[variable], errors='coerce')

    # Filter date range
    if start_date:
        sub_df = sub_df[sub_df['Standardized_Time'] >= pd.to_datetime(start_date)]
    if end_date:
        sub_df = sub_df[sub_df['Standardized_Time'] <= pd.to_datetime(end_date)]

    if sub_df.empty:
        return {
            "variable": variable,
            "aggregation": aggregation,
            "location": location,
            "total_points": 0,
            "series": []
        }

    # Sort by time
    sub_df = sub_df.sort_values(by='Standardized_Time')

    # Aggregation mapping
    freq_map = {
        "raw": None,
        "1h": "1h",
        "6h": "6h",
        "1d": "1D",
        "7d": "7D",
        "1M": "1M"
    }
    freq = freq_map.get(aggregation, "1h")

    if freq:
        # Resample on Standardized_Time
        grouped = sub_df.set_index('Standardized_Time')
        # Compute mean, min, max, count
        resampled = grouped[variable].resample(freq).agg(['mean', 'min', 'max', 'count']).reset_index()
        
        # If too many points for chart, auto-downsample or step
        step = max(1, len(resampled) // max_points)
        resampled = resampled.iloc[::step]

        series = []
        for _, row in resampled.iterrows():
            cnt = int(row['count'])
            is_valid = cnt > 0 and not np.isnan(row['mean'])
            series.append({
                "time": row['Standardized_Time'].strftime('%Y-%m-%d %H:%M'),
                "value": round(float(row['mean']), 3) if is_valid else None,
                "min": round(float(row['min']), 3) if is_valid else None,
                "max": round(float(row['max']), 3) if is_valid else None,
                "count": cnt
            })
    else:
        # Raw records
        step = max(1, len(sub_df) // max_points)
        sampled = sub_df.iloc[::step]
        series = []
        for _, row in sampled.iterrows():
            val = row[variable]
            is_valid = pd.notnull(val) and np.isfinite(val)
            series.append({
                "time": row['Standardized_Time'].strftime('%Y-%m-%d %H:%M'),
                "value": round(float(val), 3) if is_valid else None,
                "count": 1 if is_valid else 0
            })

    valid_vals = [s["value"] for s in series if s["value"] is not None]
    summary_stats = {
        "min": min(valid_vals) if valid_vals else None,
        "max": max(valid_vals) if valid_vals else None,
        "avg": round(float(np.mean(valid_vals)), 3) if valid_vals else None,
        "valid_count": len(valid_vals),
        "gap_count": len(series) - len(valid_vals)
    }

    return {
        "variable": variable,
        "aggregation": aggregation,
        "location": location,
        "total_points": len(series),
        "summary": summary_stats,
        "series": series
    }

def get_distribution_data(
    df: pd.DataFrame,
    variable: str,
    bins: int = 25
) -> Dict[str, Any]:
    """
    Computes distribution statistics, histogram bins, and box plot parameters for a numerical variable.
    """
    if df is None or df.empty:
        raise ValueError("No active dataset available.")

    if variable not in df.columns:
        raise ValueError(f"Variable '{variable}' not found in dataset.")

    series = pd.to_numeric(df[variable], errors='coerce')
    total_count = len(series)
    null_count = int(series.isnull().sum())
    valid_series = series.dropna()
    valid_count = len(valid_series)

    if valid_count == 0:
        return {
            "variable": variable,
            "stats": {
                "total_count": total_count,
                "null_count": null_count,
                "null_pct": 100.0,
                "valid_count": 0
            },
            "box_plot": None,
            "histogram": []
        }

    vals = valid_series.values
    v_min = float(np.min(vals))
    v_max = float(np.max(vals))
    v_mean = float(np.mean(vals))
    v_std = float(np.std(vals))
    v_median = float(np.median(vals))
    
    q25 = float(np.percentile(vals, 25))
    q75 = float(np.percentile(vals, 75))
    iqr = q75 - q25

    lower_whisker = float(max(v_min, q25 - 1.5 * iqr))
    upper_whisker = float(min(v_max, q75 + 1.5 * iqr))

    outliers_mask = (vals < lower_whisker) | (vals > upper_whisker)
    outlier_count = int(np.sum(outliers_mask))

    # Histogram calculation
    hist_counts, bin_edges = np.histogram(vals, bins=min(bins, max(5, valid_count // 5)))
    histogram = []
    for i in range(len(hist_counts)):
        b_start = round(float(bin_edges[i]), 3)
        b_end = round(float(bin_edges[i + 1]), 3)
        c = int(hist_counts[i])
        pct = round((c / valid_count) * 100, 2)
        histogram.append({
            "bin_start": b_start,
            "bin_end": b_end,
            "count": c,
            "percentage": pct,
            "label": f"{b_start} - {b_end}"
        })

    return {
        "variable": variable,
        "stats": {
            "total_count": total_count,
            "valid_count": valid_count,
            "null_count": null_count,
            "null_pct": round((null_count / max(1, total_count)) * 100, 1),
            "min": round(v_min, 3),
            "max": round(v_max, 3),
            "mean": round(v_mean, 3),
            "median": round(v_median, 3),
            "std": round(v_std, 3),
            "q25": round(q25, 3),
            "q75": round(q75, 3),
            "iqr": round(iqr, 3),
            "outlier_count": outlier_count
        },
        "box_plot": {
            "min": round(v_min, 3),
            "lower_whisker": round(lower_whisker, 3),
            "q25": round(q25, 3),
            "median": round(v_median, 3),
            "q75": round(q75, 3),
            "upper_whisker": round(upper_whisker, 3),
            "max": round(v_max, 3),
            "outlier_count": outlier_count
        },
        "histogram": histogram
    }
