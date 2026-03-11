import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def load_salaries() -> pd.DataFrame:
    df = pd.read_json(DATA_DIR / "DataScience_salaries_2025_clean.json")

    df["year"] = df["country_year"].str[-4:].astype(int)
    df["iso3"] = df["company_location"]
    df["country"] = df["company_location"]

    return df


def salaries_metrics() -> pd.DataFrame:
    df = load_salaries()
    return (
        df.groupby(["iso3", "country", "year"]).agg(
            salary=("salary_in_usd", "median"),
            count=("salary_in_usd", "count")
        )
        .reset_index()
    )


def load_happiness_long() -> pd.DataFrame:
    return pd.read_json(DATA_DIR / "hpi_russian_clean.json")


def load_inflation_long() -> pd.DataFrame:
    return pd.read_json(DATA_DIR / "inflation_rate_clean.json")


def load_unemployment_long() -> pd.DataFrame:
    return pd.read_json(DATA_DIR / "unemployement_rate_clean.json")


def load_corruption_long() -> pd.DataFrame:
    return pd.read_json(DATA_DIR / "corruption_perception_clean.json")


def metrics_by_year_country(year: Optional[int] = None) -> pd.DataFrame:
    happiness = load_happiness_long().rename(columns={
        "country_code": "iso3",
        "score": "happiness"
    })[["iso3", "year", "happiness"]]

    base = happiness

    if year is not None:
        base = base[base["year"] == year]

    salaries = salaries_metrics()[["iso3", "country", "year", "salary", "count"]]

    inflation = load_inflation_long().rename(columns={
        "country_code": "iso3",
        "inflation_rate": "inflation"
    })[["iso3", "year", "inflation"]]

    unemployment = load_unemployment_long().rename(columns={
        "country_code": "iso3",
        "unemployment_rate": "unemployment"
    })[["iso3", "year", "unemployment"]]

    corruption = load_corruption_long().rename(columns={
        "country_code": "iso3",
        "score": "corruption"
    })[["iso3", "year", "corruption"]]

    df = base.merge(salaries, on=["iso3", "year"], how="left")
    df = df.merge(inflation, on=["iso3", "year"], how="left")
    df = df.merge(unemployment, on=["iso3", "year"], how="left")
    df = df.merge(corruption, on=["iso3", "year"], how="left")

    df["country"] = df["country"].fillna(df["iso3"])

    df = df.replace([np.nan, np.inf, -np.inf], None)

    return df
