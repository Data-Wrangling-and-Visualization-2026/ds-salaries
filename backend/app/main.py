from fastapi import FastAPI
from app.data_loader import metrics_by_year_country
from app.models import MetricsResponse, CountryMetricYear

app = FastAPI(title="DS Salaries API")


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/metrics", response_model=MetricsResponse)
def get_metrics():
    df = metrics_by_year_country()
    data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
    return {"data": data}


@app.get("/countries/{iso3}/series", response_model=MetricsResponse)
def country_series(iso3: str):
    df = metrics_by_year_country()
    df = df[df["iso3"] == iso3]

    data = [CountryMetricYear(**row) for row in df.to_dict(orient="records")]
    return {"data": data}
