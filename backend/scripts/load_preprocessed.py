import json
from pathlib import Path
from psycopg2 import connect
from psycopg2.extras import execute_values

DB_URL = "postgresql://ds:ds@db:5432/ds_salaries"

FILES = {
    "/app/data/DataScience_salaries_2025_clean.json": (
        "ds.salaries",
        ["work_year", "experience_level", "employment_type", "job_title", "salary",
         "salary_currency", "salary_in_usd", "employee_residence", "company_location",
         "company_size", "remote_flag", "country_year"]
    ),
    "/app/data/corruption_perception_clean.json": (
        "ds.corruption",
        ["country", "region", "year", "score", "rank", "sources", "standardError",
         "lowerCi", "upperCi", "country_code", "country_year"]
    ),
    "/app/data/hpi_russian_clean.json": (
        "ds.hpi_rus",
        ["year", "score", "rank", "country", "country_code", "country_year"]
    ),
    "/app/data/inflation_rate_clean.json": (
        "ds.inflation",
        ["country_name", "year", "inflation_rate", "country_code", "country_year"]
    ),
    "/app/data/unemployement_rate_clean.json": (
        "ds.unemployment",
        ["country", "year", "unemployment_rate", "country_code", "country_year"]
    ),
}

CHUNK_SIZE = 5000


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def insert_rows(cur, table, cols, rows):
    template = "(" + ",".join(["%s"] * len(cols)) + ")"
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES %s"
    execute_values(cur, sql, rows, template=template, page_size=CHUNK_SIZE)


def main():
    with connect(DB_URL) as conn:
        with conn.cursor() as cur:
            for file_path, (table, cols) in FILES.items():
                data = load_json(Path(file_path))
                rows = [tuple(item.get(c) for c in cols) for item in data]
                for i in range(0, len(rows), CHUNK_SIZE):
                    insert_rows(cur, table, cols, rows[i:i + CHUNK_SIZE])
                    conn.commit()
                print(f"Loaded {len(rows)} rows into {table}")


if __name__ == "__main__":
    main()
