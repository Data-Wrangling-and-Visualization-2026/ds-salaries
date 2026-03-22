from pydantic import BaseModel, Field
from typing import Optional, List


class CountryMetricYear(BaseModel):
    iso3: str
    country: Optional[str] = Field(default=None)
    year: int

    salary: Optional[float] = Field(default=None)
    count: Optional[int] = Field(default=None)

    happiness: Optional[float] = Field(default=None)
    inflation: Optional[float] = Field(default=None)
    unemployment: Optional[float] = Field(default=None)
    corruption: Optional[float] = Field(default=None)


class MetricsResponse(BaseModel):
    data: List[CountryMetricYear]
