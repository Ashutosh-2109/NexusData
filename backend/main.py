from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from engine.processor import process_and_merge_datasets
from engine.correlation import discover_correlations
from engine.gemini_insights import generate_relationship_insight, generate_graph_summary
from engine.visualization import get_scatter_data, get_timeseries_data, get_distribution_data
from live.routes import router as live_router
from live.service import service as live_service
from storage import load_merged, save_merged
from maharashtra_routes import router as maharashtra_router
import os
import io
import json
import logging
import time
import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any

app = FastAPI(title="Cross-Domain Insight Discovery Engine API")
app.include_router(live_router)
app.include_router(maharashtra_router)

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"time": self.formatTime(record), "level": record.levelname,
            "logger": record.name, "message": record.getMessage()})

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), handlers=[handler], force=True)
request_logger = logging.getLogger("nexusdata.requests")

@app.middleware("http")
async def log_requests(request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    request_logger.info("%s %s status=%d duration_ms=%.1f", request.method, request.url.path,
        response.status_code, (time.perf_counter() - started) * 1000)
    return response

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))

# In-memory cache for latest merged dataset and metadata
LATEST_MERGED_DATA = {
    "df": None,
    "file_summaries": None
}

class ExplainRequest(BaseModel):
    relationship: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None

class GraphSummaryRequest(BaseModel):
    relationships: List[Dict[str, Any]]
    context: Optional[Dict[str, Any]] = None

def ensure_latest_merged_data():
    """Ensure merged dataset exists in memory, or auto-load bundled samples."""
    df = LATEST_MERGED_DATA.get("df")
    file_summaries = LATEST_MERGED_DATA.get("file_summaries")
    if df is None or df.empty:
        df, file_summaries = load_merged()
        if df is not None and not df.empty:
            LATEST_MERGED_DATA["df"] = df
            LATEST_MERGED_DATA["file_summaries"] = file_summaries
            return df, file_summaries
        files_to_load = ["raw_aqi.csv", "raw_weather.csv", "demo_load_overlap.csv"]
        files_data = []
        for fname in files_to_load:
            path = os.path.join(DATA_DIR, fname)
            if os.path.exists(path):
                with open(path, "rb") as f:
                    files_data.append({"filename": fname, "content": f.read()})
        if files_data:
            df, file_summaries = process_and_merge_datasets(files_data)
            LATEST_MERGED_DATA["df"] = df
            LATEST_MERGED_DATA["file_summaries"] = file_summaries
    return df, file_summaries

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "NexusData Engine"}

@app.get("/health")
async def container_health():
    return await health_check()

@app.get("/api/sample-files")
async def list_sample_files():
    sample_files = []
    if os.path.exists(DATA_DIR):
        for f in os.listdir(DATA_DIR):
            if f.endswith(".csv"):
                file_path = os.path.join(DATA_DIR, f)
                sample_files.append({
                    "name": f,
                    "size_bytes": os.path.getsize(file_path),
                })
    return {"sample_files": sample_files}

@app.post("/api/load-samples")
async def load_samples(include_live: bool = False):
    """Load default sample files (AQI, Weather, Load) automatically."""
    files_to_load = ["raw_aqi.csv", "raw_weather.csv", "demo_load_overlap.csv"]
    files_data = []
    for fname in files_to_load:
        path = os.path.join(DATA_DIR, fname)
        if os.path.exists(path):
            with open(path, "rb") as f:
                files_data.append({
                    "filename": fname,
                    "content": f.read()
                })
    if not files_data:
        return JSONResponse(status_code=404, content={"message": "Sample files not found on server"})
    
    if include_live:
        live_csv = live_service.live_csv_bytes()
        if live_csv:
            files_data.append({"filename": "live_india.csv", "content": live_csv})
    return execute_merge(files_data)

@app.post("/api/upload-and-merge")
async def upload_and_merge(files: list[UploadFile] = File(...), include_live: bool = False):
    if not files:
        return JSONResponse(status_code=400, content={"message": "No files uploaded"})
        
    try:
        files_data = []
        for file in files:
            content = await file.read()
            files_data.append({
                "filename": file.filename,
                "content": content
            })
            
        if include_live:
            live_csv = live_service.live_csv_bytes()
            if live_csv:
                files_data.append({"filename": "live_india.csv", "content": live_csv})
        return execute_merge(files_data)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"message": f"An error occurred: {str(e)}"})

@app.get("/analysis/correlations")
@app.get("/api/analysis/correlations")
async def get_correlations(
    min_samples: int = 10,
    prefer_cross_dataset: bool = True,
    cross_dataset_only: bool = False,
    sort_by: str = "strongest",
    dataset: Optional[str] = None,
    variable: Optional[str] = None
):
    """
    Statistical Correlation Engine API endpoint.
    Returns ranked pairwise correlations across numerical variables.
    """
    df, file_summaries = ensure_latest_merged_data()
    if df is None or df.empty:
        return JSONResponse(
            status_code=400,
            content={"message": "No active dataset available. Upload and merge datasets first."}
        )

    correlations = discover_correlations(
        df=df,
        file_summaries=file_summaries,
        min_samples=min_samples,
        prefer_cross_dataset=prefer_cross_dataset
    )

    # Filter by cross-dataset only if requested
    if cross_dataset_only:
        correlations = [c for c in correlations if c.get("is_cross_dataset")]

    # Filter by dataset name
    if dataset and isinstance(dataset, str):
        d_lower = dataset.lower()
        correlations = [
            c for c in correlations
            if d_lower in c.get("dataset_a", "").lower() or d_lower in c.get("dataset_b", "").lower()
        ]

    # Filter by variable name
    if variable and isinstance(variable, str):
        v_lower = variable.lower()
        correlations = [
            c for c in correlations
            if v_lower in c.get("variable_a", "").lower() or v_lower in c.get("variable_b", "").lower()
        ]

    # Sort results according to requested strategy
    if sort_by == "weakest":
        correlations.sort(key=lambda c: c.get("rank_score", 0.0))
    elif sort_by == "pearson":
        correlations.sort(key=lambda c: abs(c.get("pearson") or 0.0), reverse=True)
    elif sort_by == "spearman":
        correlations.sort(key=lambda c: abs(c.get("spearman") or 0.0), reverse=True)
    elif sort_by == "mutual_information":
        correlations.sort(key=lambda c: c.get("mutual_information") or 0.0, reverse=True)
    elif sort_by == "strongest":
        correlations.sort(
            key=lambda c: (
                1 if (prefer_cross_dataset and c.get("is_cross_dataset")) else 0,
                c.get("rank_score", 0.0),
                c.get("mutual_information") or 0.0
            ),
            reverse=True
        )

    return {
        "status": "success",
        "total_relationships": len(correlations),
        "min_samples_threshold": min_samples,
        "note": "Statistical association only. Correlation does not imply causation.",
        "relationships": correlations
    }

# VISUALIZATION ENDPOINTS
@app.get("/api/visualize/scatter")
async def visualize_scatter(
    x_var: str,
    y_var: str,
    max_points: int = 1000
):
    """
    Returns scatter plot points, linear regression, and Pearson/Spearman metrics.
    """
    df, _ = ensure_latest_merged_data()
    if df is None:
        return JSONResponse(status_code=400, content={"message": "No active dataset available."})
    try:
        data = get_scatter_data(df, x_var=x_var, y_var=y_var, max_points=max_points)
        return {"success": True, "data": data}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.get("/api/visualize/timeseries")
async def visualize_timeseries(
    variable: str,
    location: Optional[str] = None,
    aggregation: str = "1h",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    max_points: int = 1500
):
    """
    Returns time series line chart observations against Standardized_Time.
    Preserves null gaps without fabricating missing data.
    """
    df, _ = ensure_latest_merged_data()
    if df is None:
        return JSONResponse(status_code=400, content={"message": "No active dataset available."})
    try:
        data = get_timeseries_data(
            df=df,
            variable=variable,
            location=location,
            aggregation=aggregation,
            start_date=start_date,
            end_date=end_date,
            max_points=max_points
        )
        return {"success": True, "data": data}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.get("/api/visualize/distribution")
async def visualize_distribution(
    variable: str,
    bins: int = 25
):
    """
    Returns histogram frequencies and box-plot parameters (Q1, median, Q3, IQR, whiskers, outliers).
    """
    df, _ = ensure_latest_merged_data()
    if df is None:
        return JSONResponse(status_code=400, content={"message": "No active dataset available."})
    try:
        data = get_distribution_data(df, variable=variable, bins=bins)
        return {"success": True, "data": data}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.post("/api/insights/explain")
async def explain_relationship_endpoint(payload: ExplainRequest):
    """
    Interprets a single pairwise statistical relationship using the Gemini API.
    Does NOT calculate correlations; strictly explains the provided empirical values.
    """
    try:
        insight = generate_relationship_insight(
            relationship=payload.relationship,
            context=payload.context
        )
        return {
            "success": True,
            "insight": insight
        }
    except Exception as e:
        error_msg = str(e)
        return {
            "success": False,
            "error": error_msg,
            "message": "AI insight unavailable. The statistical relationship is still available."
        }

@app.post("/api/insights/graph-summary")
async def graph_summary_endpoint(payload: GraphSummaryRequest):
    """
    Generates a macro-level overview for the Insight Graph based on top statistical pairs.
    """
    try:
        summary = generate_graph_summary(
            top_relationships=payload.relationships,
            context=payload.context
        )
        return {
            "success": True,
            "summary": summary
        }
    except Exception as e:
        error_msg = str(e)
        return {
            "success": False,
            "error": error_msg,
            "message": "Graph-level AI overview unavailable. Statistical evidence is still fully accessible."
        }

def execute_merge(files_data: list):
    try:
        merged_df, file_summaries = process_and_merge_datasets(files_data)
        
        # Cache for correlation analysis
        LATEST_MERGED_DATA["df"] = merged_df
        LATEST_MERGED_DATA["file_summaries"] = file_summaries
        save_merged(merged_df, file_summaries)

        row_count = len(merged_df)
        columns = list(merged_df.columns)
        ranges = [summary.get("time_range") for summary in file_summaries if summary.get("time_range")]
        overlap_start = max((pd.Timestamp(item["start"]) for item in ranges), default=None)
        overlap_end = min((pd.Timestamp(item["end"]) for item in ranges), default=None)
        overlap_hours = max(0, int((overlap_end - overlap_start).total_seconds() // 3600) + 1) if overlap_start is not None and overlap_end is not None else 0
        overlap = {"start": overlap_start.isoformat(), "end": overlap_end.isoformat(), "hours": overlap_hours} if overlap_hours else None
        
        # Sort by Standardized_Time if available
        if 'Standardized_Time' in merged_df.columns:
            merged_df.sort_values(by=['Standardized_Time'], inplace=True, ascending=True)
            
        # Compute column metadata
        columns_meta = []
        for col in columns:
            series = merged_df[col]
            null_count = int(series.isnull().sum())
            null_pct = round((null_count / max(row_count, 1)) * 100, 1)
            
            is_numeric = pd.api.types.is_numeric_dtype(series)
            is_datetime = pd.api.types.is_datetime64_any_dtype(series)
            
            col_type = "numeric" if is_numeric else ("datetime" if is_datetime or col == "Standardized_Time" else "categorical")
            
            stats_dict = {
                "name": col,
                "type": col_type,
                "null_count": null_count,
                "null_pct": null_pct,
                "non_null_count": row_count - null_count
            }
            
            if is_numeric:
                non_null_series = series.dropna()
                if not non_null_series.empty:
                    stats_dict["min"] = round(float(non_null_series.min()), 2)
                    stats_dict["max"] = round(float(non_null_series.max()), 2)
                    stats_dict["mean"] = round(float(non_null_series.mean()), 2)
                    
            columns_meta.append(stats_dict)
            
        # Time range detection
        time_range = None
        if 'Standardized_Time' in merged_df.columns and not merged_df['Standardized_Time'].dropna().empty:
            times = pd.to_datetime(merged_df['Standardized_Time'].dropna())
            time_range = {
                "start": times.min().strftime('%Y-%m-%d %H:%M'),
                "end": times.max().strftime('%Y-%m-%d %H:%M')
            }
            
        # Locations detected
        unique_locations = []
        if 'Standardized_Location' in merged_df.columns:
            unique_locations = [str(loc) for loc in merged_df['Standardized_Location'].dropna().unique()][:20]

        # Calculate statistical correlations
        correlations = discover_correlations(
            df=merged_df,
            file_summaries=file_summaries,
            min_samples=10,
            prefer_cross_dataset=True
        )
            
        # Format datetime column for JSON output
        df_for_json = merged_df.copy()
        if 'Standardized_Time' in df_for_json.columns:
            df_for_json['Standardized_Time'] = pd.to_datetime(df_for_json['Standardized_Time']).dt.strftime('%Y-%m-%d %H:%M:%S')
            
        # Generate CSV representation for instant browser download
        csv_buffer = io.StringIO()
        df_for_json.to_csv(csv_buffer, index=False)
        csv_content = csv_buffer.getvalue()
        
        # Replace NaN/NaT with None for JSON preview (up to 50 rows for rich table paging)
        df_for_json = df_for_json.replace({float('nan'): None, np.nan: None})
        sample_data = df_for_json.head(50).to_dict(orient="records")
        
        return {
            "message": "Data successfully harmonized and merged!",
            "summary": {
                "total_rows": row_count,
                "total_columns": len(columns),
                "columns": columns,
                "columns_meta": columns_meta,
                "time_range": time_range,
                "unique_locations": unique_locations,
                "file_summaries": file_summaries,
                "overlap": overlap
            },
            "sample_data": sample_data,
            "correlations": correlations,
            "csv_download": csv_content
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"message": f"Processing error: {str(e)}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
