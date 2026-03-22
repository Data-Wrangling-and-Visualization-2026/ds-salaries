import pandas as pd
import numpy as np
from typing import Optional
from psycopg2 import connect
import os

DB_URL = os.getenv("DB_URL", "postgresql://ds:ds@localhost:5432/ds_salaries")


def query_df(sql: str) -> pd.DataFrame:
    with connect(DB_URL) as conn:
        return pd.read_sql_query(sql, conn)


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
            inflation_rate AS inflation
        FROM ds.inflation
    """
    return query_df(sql)


def load_unemployment() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            unemployment_rate AS unemployment
        FROM ds.unemployment
    """
    return query_df(sql)


def load_corruption() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            score AS corruption
        FROM ds.corruption
    """
    return query_df(sql)


def metrics_by_year_country(year: Optional[int] = None) -> pd.DataFrame:
    sql = """
        SELECT 
            COALESCE(h.country_code, i.country_code, u.country_code, c.country_code, s.company_location) AS iso3,
            COALESCE(h.year, i.year, u.year, c.year, s.work_year) AS year,
            h.country,
            h.score AS happiness,
            i.inflation_rate AS inflation,
            u.unemployment_rate AS unemployment,
            c.score AS corruption,
            s.salary,
            s.count
        FROM ds.hpi_rus h
        FULL OUTER JOIN ds.inflation i 
            ON h.country_code = i.country_code AND h.year = i.year
        FULL OUTER JOIN ds.unemployment u 
            ON COALESCE(h.country_code, i.country_code) = u.country_code 
            AND COALESCE(h.year, i.year) = u.year
        FULL OUTER JOIN ds.corruption c 
            ON COALESCE(h.country_code, i.country_code, u.country_code) = c.country_code
            AND COALESCE(h.year, i.year, u.year) = c.year
        FULL OUTER JOIN (
            SELECT 
                company_location,
                work_year,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_in_usd) AS salary,
                COUNT(*) AS count
            FROM ds.salaries
            GROUP BY company_location, work_year
        ) s
            ON COALESCE(h.country_code, i.country_code, u.country_code, c.country_code) = s.company_location
            AND COALESCE(h.year, i.year, u.year, c.year) = s.work_year
    """

    df = query_df(sql)

    if year is not None:
        df = df[df["year"] == year]

    df["country"] = df["country"].fillna(df["iso3"])
    df["salary"] = df["salary"].fillna(0)
    df["count"] = df["count"].fillna(0)

    df = df.replace([np.nan, np.inf, -np.inf], None)

    df = df.drop_duplicates(subset=["iso3", "year"])

    return df
