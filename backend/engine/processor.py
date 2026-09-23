import pandas as pd
import numpy as np
from thefuzz import process
import dateutil.parser
import io

def detect_time_column(df):
    """
    Heuristic to find the time column.
    Checks column names first, then tries to parse the first few rows.
    """
    time_keywords = ['time', 'date', 'stamp', 'dt']
    for col in df.columns:
        if any(keyword in col.lower() for keyword in time_keywords):
            return col
            
    # Fallback: check if we can parse the first value of a column (string/object)
    for col in df.select_dtypes(include=['object', 'string']).columns:
        try:
            # check first non-null
            val = df[col].dropna().iloc[0]
            dateutil.parser.parse(str(val))
            return col
        except:
            pass
    return None

def detect_location_column(df):
    """
    Heuristic to find the location/city column.
    """
    loc_keywords = ['city', 'location', 'region', 'area']
    for col in df.columns:
        if any(keyword in col.lower() for keyword in loc_keywords):
            return col
    return None

def standardize_time(df, time_col):
    """
    Parses mixed date formats into datetime objects.
    """
    # use pandas to_datetime with mixed formats
    df[time_col] = pd.to_datetime(df[time_col], format='mixed', errors='coerce', dayfirst=True)
    return df

def normalize_cities(df, loc_col, master_cities=None):
    """
    Lowercases, strips, and fuzzy matches city names.
    If master_cities is None, builds it from the current dataframe to use as a baseline.
    """
    if not df[loc_col].dtype == 'object':
        return df, master_cities
        
    df[loc_col] = df[loc_col].astype(str).str.lower().str.strip()
    
    unique_cities = df[loc_col].dropna().unique()
    
    if master_cities is None:
        master_cities = list(unique_cities)
    else:
        # Fuzzy match new cities to master_cities
        mapping = {}
        for city in unique_cities:
            best_match, score = process.extractOne(city, master_cities)
            if score >= 85: # Threshold for considering it the same city
                mapping[city] = best_match
            else:
                mapping[city] = city
                master_cities.append(city)
        df[loc_col] = df[loc_col].map(mapping)
        
    return df, master_cities

def process_and_merge_datasets(files_data):
    """
    Takes a list of file contents, processes them, and merges them.
    files_data: list of dicts {'filename': str, 'content': bytes}
    """
    processed_dfs = []
    master_cities = None
    
    for file_data in files_data:
        try:
            # Read CSV
            df = pd.read_csv(io.BytesIO(file_data['content']))
            
            # Detect Columns
            time_col = detect_time_column(df)
            loc_col = detect_location_column(df)
            
            if time_col:
                df = standardize_time(df, time_col)
                df = df.dropna(subset=[time_col]) # Drop rows where time parsing failed
                df.set_index(time_col, inplace=True)
                
                # If there's a location column, we need to group by location and resample
                if loc_col:
                    df, master_cities = normalize_cities(df, loc_col, master_cities)
                    
                    # Resample to hourly by location
                    # For numeric columns we mean(), for categorical we first()
                    numeric_cols = df.select_dtypes(include=[np.number]).columns
                    
                    # Group by location, then resample hourly
                    # Using pd.Grouper
                    df = df.groupby([loc_col, pd.Grouper(freq='1H')])[numeric_cols].mean().reset_index()
                else:
                    # No location, just resample
                    numeric_cols = df.select_dtypes(include=[np.number]).columns
                    df = df.resample('1H')[numeric_cols].mean().reset_index()
                    
                processed_dfs.append(df)
        except Exception as e:
            print(f"Error processing file {file_data['filename']}: {e}")
            continue
            
    if not processed_dfs:
        raise ValueError("Could not process any of the uploaded files.")
        
    # Merge all dataframes on time and location (if available)
    final_df = processed_dfs[0]
    for df in processed_dfs[1:]:
        # Find common columns to merge on
        merge_on = []
        if 'time' in final_df.columns or 'date' in final_df.columns:
             pass # Already handled by standardizing time col name? No, we reset index.
             
        # Let's standardize the time column name for the merged df
        # Find the time column in final_df
        time_col_final = [c for c in final_df.columns if pd.api.types.is_datetime64_any_dtype(final_df[c]) or c in ['index'] or detect_time_column(final_df[[c]])][0]
        time_col_df = [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c]) or c in ['index'] or detect_time_column(df[[c]])][0]
        
        final_df.rename(columns={time_col_final: 'Standardized_Time'}, inplace=True)
        df.rename(columns={time_col_df: 'Standardized_Time'}, inplace=True)
        
        merge_keys = ['Standardized_Time']
        
        # Location column
        loc_col_final = detect_location_column(final_df)
        loc_col_df = detect_location_column(df)
        
        if loc_col_final and loc_col_df:
            final_df.rename(columns={loc_col_final: 'Standardized_Location'}, inplace=True)
            df.rename(columns={loc_col_df: 'Standardized_Location'}, inplace=True)
            merge_keys.append('Standardized_Location')
            
        final_df = pd.merge(final_df, df, on=merge_keys, how='outer')
        
    return final_df
