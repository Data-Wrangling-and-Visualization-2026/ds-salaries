import pandas as pd
import numpy as np
from typing import Optional
from psycopg2 import connect

DB_URL = "postgresql://ds:ds@db:5432/ds_salaries"


def query_df(sql: str, params=None) -> pd.DataFrame:
    with connect(DB_URL) as conn:
        return pd.read_sql_query(sql, conn, params=params)


def load_salaries_metrics() -> pd.DataFrame:
    sql = """
        SELECT 
            company_location AS iso3,
            work_year AS year,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_in_usd) AS salary,
            COUNT(*) AS count
        FROM ds.salaries
        GROUP BY company_location, work_year
    """
    return query_df(sql)


def load_happiness() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            country,
            score AS happiness
        FROM ds.hpi_rus
    """
    return query_df(sql)


def load_inflation() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            inflation_rate
        FROM ds.inflation
    """
    return query_df(sql)


def load_unemployment() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            unemployment_rate
        FROM ds.unemployment
    """
    return query_df(sql)


def load_corruption() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            score AS corruption_score
        FROM ds.corruption
    """
    return query_df(sql)


def metrics_by_year_country(year: Optional[int] = None) -> pd.DataFrame:
    salaries = load_salaries_metrics()
    happiness = load_happiness()
    inflation = load_inflation()
    unemployment = load_unemployment()
    corruption = load_corruption()

    base = happiness.merge(inflation, how="outer", on=["iso3", "year"])
    base = base.merge(unemployment, how="outer", on=["iso3", "year"])
    base = base.merge(corruption, how="outer", on=["iso3", "year"])
    base = base.merge(salaries, how="left", on=["iso3", "year"])

    if year is not None:
        base = base[base["year"] == year]

    base = base.replace([np.nan, np.inf, -np.inf], None)

    base["country"] = base["country"].fillna(base["iso3"])
    base["salary"] = base["salary"].fillna(0)
    base["count"] = base["count"].fillna(0)

    return base
