import pandas as pd
from pathlib import Path

DATA_PATH = Path("data/DataScience_salaries_2025_clean.json")


def load_salaries() -> pd.DataFrame:
    df = pd.read_json(DATA_PATH)

    df["year"] = df["country_year"].str[-4:].astype(int)

    df["country"] = df["company_location"]
    df["iso3"] = df["company_location"]

    return df


def metrics_by_year_country() -> pd.DataFrame:
    df = load_salaries()

    grouped = (
        df.groupby(["iso3", "country", "year"])
        .agg(
            salary=("salary_in_usd", "median"),
            count=("salary_in_usd", "count")
        )
        .reset_index()
    )

    return grouped
