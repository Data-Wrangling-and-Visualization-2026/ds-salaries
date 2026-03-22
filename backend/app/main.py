from typing import Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.data_loader import metrics_by_year_country
from app.models import MetricsResponse, CountryMetricYear
import pandas as pd
import numpy as np

app = FastAPI(title="DS Salaries API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics", response_model=MetricsResponse)
def get_metrics(year: Optional[int] = Query(None, ge=2014, le=2025)):
    try:
        df = metrics_by_year_country(year)
        
        if df.empty:
            print("DataFrame is empty")
            return {"data": []}
     
        if 'year' in df.columns:
            df['year'] = pd.to_numeric(df['year'], errors='coerce')
            df = df.dropna(subset=['year'])
            df['year'] = df['year'].astype(int)

        if 'iso3' in df.columns:
            df = df.dropna(subset=['iso3'])
            df['iso3'] = df['iso3'].astype(str)
        
        if year is None:
            if not df.empty:
                df = df[df["year"] >= 2020]
            df = df.head(5000)
        
        if df.empty:
            print(f"No data after filtering for year={year}")
            return {"data": []}
        
        df = df.replace({pd.NA: None, pd.NaT: None, np.nan: None, np.inf: None, -np.inf: None})
        
        df = df[df['iso3'].notna()]
        
        data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
        return {"data": data}
        
    except Exception as e:
        print(f"Error in /metrics: {e}")
        import traceback
        traceback.print_exc()
        return {"data": []}


@app.get("/countries")
def countries():
    try:
        df = metrics_by_year_country()
        if df.empty:
            return []
        
        df = df.dropna(subset=['iso3'])
        countries_list = sorted(df["iso3"].astype(str).unique().tolist())
        return countries_list
        
    except Exception as e:
        print(f"Error in /countries: {e}")
        import traceback
        traceback.print_exc()
        return []


@app.get("/years")
def years():
    try:
        df = metrics_by_year_country()
        if df.empty:
            return []
 
        if 'year' in df.columns:
            df['year'] = pd.to_numeric(df['year'], errors='coerce')
            df = df.dropna(subset=['year'])
            years_list = sorted(df["year"].astype(int).unique().tolist())
            return years_list
        
        return []
        
    except Exception as e:
        print(f"Error in /years: {e}")
        import traceback
        traceback.print_exc()
        return []


@app.get("/countries/{iso3}/series", response_model=MetricsResponse)
def country_series(iso3: str):
    try:
        df = metrics_by_year_country()
        if df.empty:
            return {"data": []}
        
        df = df[df["iso3"] == iso3]
        
        if df.empty:
            return {"data": []}

        if 'year' in df.columns:
            df['year'] = pd.to_numeric(df['year'], errors='coerce')
            df = df.dropna(subset=['year'])
            df['year'] = df['year'].astype(int)
            df = df.sort_values("year")

        df = df.replace({pd.NA: None, pd.NaT: None, np.nan: None, np.inf: None, -np.inf: None})
        
        df = df.dropna(subset=['iso3'])
        
        data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
        return {"data": data}
        
    except Exception as e:
        print(f"Error in /countries/{iso3}/series: {e}")
        import traceback
        traceback.print_exc()
        return {"data": []}
