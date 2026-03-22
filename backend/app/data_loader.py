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
    df = query_df(sql)
    if not df.empty and 'year' in df.columns:
        df['year'] = pd.to_numeric(df['year'], errors='coerce')
        df = df.dropna(subset=['year'])
        df['year'] = df['year'].astype(int)
    
    if not df.empty and 'iso3' in df.columns:
        df = df.dropna(subset=['iso3'])
        df['iso3'] = df['iso3'].astype(str)
    
    return df


def load_happiness() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            country,
            score AS happiness
        FROM ds.hpi_rus
    """
    df = query_df(sql)
    if not df.empty and 'year' in df.columns:
        df['year'] = pd.to_numeric(df['year'], errors='coerce')
        df = df.dropna(subset=['year'])
        df['year'] = df['year'].astype(int)

    if not df.empty and 'iso3' in df.columns:
        df = df.dropna(subset=['iso3'])
        df['iso3'] = df['iso3'].astype(str)
    
    return df


def load_inflation() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            inflation_rate AS inflation
        FROM ds.inflation
    """
    df = query_df(sql)
    if not df.empty and 'year' in df.columns:
        df['year'] = pd.to_numeric(df['year'], errors='coerce')
        df = df.dropna(subset=['year'])
        df['year'] = df['year'].astype(int)
    
    if not df.empty and 'iso3' in df.columns:
        df = df.dropna(subset=['iso3'])
        df['iso3'] = df['iso3'].astype(str)
    
    return df


def load_unemployment() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            unemployment_rate AS unemployment
        FROM ds.unemployment
    """
    df = query_df(sql)
    if not df.empty and 'year' in df.columns:
        df['year'] = pd.to_numeric(df['year'], errors='coerce')
        df = df.dropna(subset=['year'])
        df['year'] = df['year'].astype(int)
    
    if not df.empty and 'iso3' in df.columns:
        df = df.dropna(subset=['iso3'])
        df['iso3'] = df['iso3'].astype(str)
    
    return df


def load_corruption() -> pd.DataFrame:
    sql = """
        SELECT 
            country_code AS iso3,
            year,
            score AS corruption
        FROM ds.corruption
    """
    df = query_df(sql)
    if not df.empty and 'year' in df.columns:
        df['year'] = pd.to_numeric(df['year'], errors='coerce')
        df = df.dropna(subset=['year'])
        df['year'] = df['year'].astype(int)
    
    if not df.empty and 'iso3' in df.columns:
        df = df.dropna(subset=['iso3'])
        df['iso3'] = df['iso3'].astype(str)
    
    return df


def metrics_by_year_country(year: Optional[int] = None) -> pd.DataFrame:
    try:
        salaries = load_salaries_metrics()
        happiness = load_happiness()
        inflation = load_inflation()
        unemployment = load_unemployment()
        corruption = load_corruption()

        # Проверяем, что happiness не пустой
        if happiness.empty:
            print("Happiness data is empty")
            return pd.DataFrame(columns=[
                "iso3", "country", "year", "salary", "count",
                "happiness", "inflation", "unemployment", "corruption"
            ])

        base = happiness.copy()

        if not salaries.empty:
            base = base.merge(salaries, on=["iso3", "year"], how="outer")
        
        if not inflation.empty:
            base = base.merge(inflation, on=["iso3", "year"], how="outer")
        
        if not unemployment.empty:
            base = base.merge(unemployment, on=["iso3", "year"], how="outer")
        
        if not corruption.empty:
            base = base.merge(corruption, on=["iso3", "year"], how="outer")

        if year is not None:
            base = base[base["year"] == year]

        base["country"] = base["country"].fillna(base["iso3"])
        base["salary"] = base["salary"].fillna(0)
        base["count"] = base["count"].fillna(0)

        base = base.replace([np.nan, np.inf, -np.inf], None)

        base = base.drop_duplicates(subset=["iso3", "year"])

        base = base.dropna(subset=['iso3'])

        if not base.empty:
            base = base.sort_values(["year", "iso3"])

        return base

    except Exception as e:
        print(f"Error in metrics_by_year_country: {e}")
        import traceback
        traceback.print_exc()
        return pd.DataFrame(columns=[
            "iso3", "country", "year", "salary", "count",
            "happiness", "inflation", "unemployment", "corruption"
        ])
