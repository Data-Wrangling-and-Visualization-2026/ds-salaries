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


class USAProfession(BaseModel):
    job_title: str
    count: int
    median_salary: float


class USAProfessionsResponse(BaseModel):
    data: list[USAProfession]


class USAExperienceLevel(BaseModel):
    experience_level: str
    count: int
    median_salary: float


class USAExperienceResponse(BaseModel):
    data: list[USAExperienceLevel]
