import pandas as pd
import numpy as np
from scipy import stats
from sklearn.feature_selection import mutual_info_regression
import itertools
from typing import List, Dict, Any, Optional

def classify_strength(r_val: Optional[float]) -> str:
    """
    Classify relationship strength using configurable thresholds.
    |r| < 0.2 -> Very Weak
    0.2 - 0.4 -> Weak
    0.4 - 0.6 -> Moderate
    0.6 - 0.8 -> Strong
    0.8 - 1.0 -> Very Strong
    Includes directional indicator (Positive / Negative).
    NOTE: Correlation does not imply causation.
    """
    if r_val is None or np.isnan(r_val):
        return "Indeterminate"
        
    abs_r = abs(r_val)
    if abs_r < 0.2:
        return "Very Weak"
        
    direction = "Positive" if r_val > 0 else "Negative"
    
    if abs_r < 0.4:
        return f"Weak {direction}"
    elif abs_r < 0.6:
        return f"Moderate {direction}"
    elif abs_r < 0.8:
        return f"Strong {direction}"
    else:
        return f"Very Strong {direction}"

def get_column_dataset_map(file_summaries: Optional[List[Dict[str, Any]]]) -> Dict[str, str]:
    """
    Maps column names to their originating dataset filename based on file summaries.
    """
    col_map = {}
    if not file_summaries:
        return col_map
        
    for summary in file_summaries:
        fname = summary.get("filename", "Unknown Dataset")
        for col in summary.get("columns", []):
            if col not in col_map:
                col_map[col] = fname
    return col_map

def compute_pairwise_relationship(
    series_a: pd.Series,
    series_b: pd.Series,
    col_a: str,
    col_b: str,
    dataset_a: str,
    dataset_b: str,
    total_df_rows: int,
    min_samples: int = 10,
    max_mi_samples: int = 2500
) -> Optional[Dict[str, Any]]:
    """
    Computes Pearson, Spearman, Mutual Information, and metadata for a pair of series.
    Safely handles NaN, infinite values, and constant columns.
    """
    # 1. Clean and align data
    df_pair = pd.DataFrame({"a": series_a, "b": series_b})
    
    # Replace inf with nan
    df_pair.replace([np.inf, -np.inf], np.nan, inplace=True)
    
    # Drop pairwise missing values
    valid_pair = df_pair.dropna()
    sample_count = int(len(valid_pair))
    
    # Check minimum samples requirement
    if sample_count < min_samples:
        return None
        
    x = valid_pair["a"].to_numpy(dtype=float)
    y = valid_pair["b"].to_numpy(dtype=float)
    
    # Check for constant columns (std == 0)
    std_x = np.std(x)
    std_y = np.std(y)
    if std_x == 0 or std_y == 0 or np.isnan(std_x) or np.isnan(std_y):
        return None
        
    # Missing percentage relative to overall merged dataset rows
    missing_percentage = round(((total_df_rows - sample_count) / max(total_df_rows, 1)) * 100, 2)
    
    # 2. Pearson Correlation
    pearson_corr = None
    try:
        r_p, _ = stats.pearsonr(x, y)
        if not np.isnan(r_p) and not np.isinf(r_p):
            pearson_corr = round(float(r_p), 4)
    except Exception:
        pearson_corr = None

    # 3. Spearman Rank Correlation
    spearman_corr = None
    try:
        r_s, _ = stats.spearmanr(x, y)
        if not np.isnan(r_s) and not np.isinf(r_s):
            spearman_corr = round(float(r_s), 4)
    except Exception:
        spearman_corr = None

    # 4. Mutual Information
    mi_val = None
    try:
        # If large sample count, subsample for efficient calculation
        if sample_count > max_mi_samples:
            indices = np.random.RandomState(42).choice(sample_count, size=max_mi_samples, replace=False)
            x_mi = x[indices].reshape(-1, 1)
            y_mi = y[indices]
        else:
            x_mi = x.reshape(-1, 1)
            y_mi = y
            
        mi_result = mutual_info_regression(x_mi, y_mi, random_state=42)
        if len(mi_result) > 0 and not np.isnan(mi_result[0]):
            mi_val = round(float(max(0.0, mi_result[0])), 4)
    except Exception:
        mi_val = None

    # Determine representative correlation for strength classification
    primary_r = pearson_corr if pearson_corr is not None else spearman_corr
    relationship_strength = classify_strength(primary_r)
    is_cross_dataset = (dataset_a != dataset_b)
    
    # Association score for primary ranking
    abs_pearson = abs(pearson_corr) if pearson_corr is not None else 0.0
    abs_spearman = abs(spearman_corr) if spearman_corr is not None else 0.0
    rank_score = round(max(abs_pearson, abs_spearman), 4)

    return {
        "dataset_a": dataset_a,
        "variable_a": col_a,
        "dataset_b": dataset_b,
        "variable_b": col_b,
        "sample_count": sample_count,
        "pearson": pearson_corr,
        "spearman": spearman_corr,
        "mutual_information": mi_val,
        "missing_percentage": missing_percentage,
        "relationship_strength": relationship_strength,
        "is_cross_dataset": is_cross_dataset,
        "rank_score": rank_score
    }

def discover_correlations(
    df: pd.DataFrame,
    file_summaries: Optional[List[Dict[str, Any]]] = None,
    min_samples: int = 10,
    prefer_cross_dataset: bool = True
) -> List[Dict[str, Any]]:
    """
    Main entry point for Statistical Correlation Engine.
    Discovers, scores, and ranks pairwise numerical relationships across datasets.
    """
    if df.empty or len(df.columns) < 2:
        return []
        
    total_df_rows = len(df)
    
    # Map each column to its original source dataset
    col_dataset_map = get_column_dataset_map(file_summaries)
    
    # Identify valid numerical columns (exclude standardized index/time keys if not numeric)
    candidate_cols = []
    for col in df.columns:
        if col in ["Standardized_Time", "Standardized_Location"]:
            continue
        if pd.api.types.is_numeric_dtype(df[col]):
            candidate_cols.append(col)
            
    # Generate unique candidate pairs (A-B == B-A, no self-comparisons)
    pairs = list(itertools.combinations(candidate_cols, 2))
    
    results = []
    for col_a, col_b in pairs:
        dataset_a = col_dataset_map.get(col_a, "Dataset A")
        dataset_b = col_dataset_map.get(col_b, "Dataset B")
        
        try:
            rel = compute_pairwise_relationship(
                series_a=df[col_a],
                series_b=df[col_b],
                col_a=col_a,
                col_b=col_b,
                dataset_a=dataset_a,
                dataset_b=dataset_b,
                total_df_rows=total_df_rows,
                min_samples=min_samples
            )
            if rel is not None:
                results.append(rel)
        except Exception as e:
            # Robustness: do not crash if one pair fails
            print(f"Warning: Failed to analyze relationship between {col_a} and {col_b}: {e}")
            continue

    # Rank results:
    # If prefer_cross_dataset is True, sort cross-dataset relationships first,
    # then by rank_score (highest absolute Pearson/Spearman correlation).
    if prefer_cross_dataset:
        results.sort(
            key=lambda r: (
                1 if r["is_cross_dataset"] else 0,
                r["rank_score"],
                r["mutual_information"] or 0.0
            ),
            reverse=True
        )
    else:
        results.sort(
            key=lambda r: (
                r["rank_score"],
                r["mutual_information"] or 0.0
            ),
            reverse=True
        )

    return results
