from pydantic import BaseModel


class CountryMetricYear(BaseModel):
    iso3: str
    country: str
    year: int
    salary: float
    count: int


class MetricsResponse(BaseModel):
    data: list[CountryMetricYear]
