from pydantic import BaseModel
from typing import Optional


class CountryMetricYear(BaseModel):
    iso3: str
    country: Optional[str] = None
    year: int

    salary: Optional[float] = None
    count: Optional[int] = None

    happiness: Optional[float] = None
    inflation: Optional[float] = None
    unemployment: Optional[float] = None
    corruption: Optional[float] = None


class MetricsResponse(BaseModel):
    data: list[CountryMetricYear]
