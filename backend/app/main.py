from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.data_loader import metrics_by_year_country
from app.models import MetricsResponse, CountryMetricYear

app = FastAPI(title="DS Salaries API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/metrics", response_model=MetricsResponse)
def get_metrics(year: Optional[int] = Query(None, ge=2014, le=2025)):
    df = metrics_by_year_country(year) if year is not None else metrics_by_year_country()
    data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
    return {"data": data}


@app.get("/countries/{iso3}/series", response_model=MetricsResponse)
def country_series(iso3: str):
    df = metrics_by_year_country()
    df = df[df["iso3"] == iso3]

    data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
    return {"data": data}
