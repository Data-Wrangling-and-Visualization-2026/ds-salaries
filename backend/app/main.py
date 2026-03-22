from typing import Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.data_loader import metrics_by_year_country
from app.models import MetricsResponse, CountryMetricYear

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

        if year is None:
            df = df[df["year"] >= 2020]
            df = df.head(5000)

        data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
        return {"data": data}
    except Exception as e:
        print(f"Error in /metrics: {e}")
        return {"data": []}


@app.get("/countries")
def countries():
    try:
        df = metrics_by_year_country()
        countries_list = sorted(df["iso3"].dropna().unique().tolist())
        return countries_list
    except Exception as e:
        print(f"Error in /countries: {e}")
        return []


@app.get("/years")
def years():
    try:
        df = metrics_by_year_country()
        years_list = sorted(df["year"].dropna().unique().tolist())
        return years_list
    except Exception as e:
        print(f"Error in /years: {e}")
        return []


@app.get("/countries/{iso3}/series", response_model=MetricsResponse)
def country_series(iso3: str):
    try:
        df = metrics_by_year_country()
        df = df[df["iso3"] == iso3]
        df = df.sort_values("year")

        data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
        return {"data": data}
    except Exception as e:
        print(f"Error in /countries/{iso3}/series: {e}")
        return {"data": []}
