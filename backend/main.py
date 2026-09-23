from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from engine.processor import process_and_merge_datasets
import json

app = FastAPI(title="Cross-Domain Insight Discovery Engine API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/upload-and-merge")
async def upload_and_merge(files: list[UploadFile] = File(...)):
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
            
        # Run the engine
        merged_df = process_and_merge_datasets(files_data)
        
        # Prepare response
        # 1. Summary stats
        row_count = len(merged_df)
        columns = list(merged_df.columns)
        
        # 2. Sample data (first 5 rows)
        # Convert datetime to string for JSON serialization
        if 'Standardized_Time' in merged_df.columns:
            merged_df['Standardized_Time'] = merged_df['Standardized_Time'].dt.strftime('%Y-%m-%d %H:%M:%S')
            
        # Replace NaN/NaT with None for valid JSON
        merged_df = merged_df.replace({float('nan'): None})
        sample_data = merged_df.head(5).to_dict(orient="records")
        
        return {
            "message": "Data successfully merged!",
            "summary": {
                "total_rows": row_count,
                "columns": columns,
            },
            "sample_data": sample_data
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"message": f"An error occurred: {str(e)}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
