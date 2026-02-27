from pydantic import BaseModel
from typing import Optional


class CountryMetricYear(BaseModel):
    iso3: str
    country: str
    year: int

    salary: float
    count: int

    happiness: Optional[float] = None
    inflation: Optional[float] = None
    unemployment: Optional[float] = None
    corruption: Optional[float] = None


class MetricsResponse(BaseModel):
    data: list[CountryMetricYear]
