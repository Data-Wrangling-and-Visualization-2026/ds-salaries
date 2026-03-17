CREATE SCHEMA IF NOT EXISTS ds;

CREATE TABLE ds.salaries (
  id BIGSERIAL PRIMARY KEY,
  work_year INT,
  experience_level TEXT,
  employment_type TEXT,
  job_title TEXT,
  salary NUMERIC,
  salary_currency TEXT,
  salary_in_usd NUMERIC,
  employee_residence TEXT,
  company_location TEXT,
  company_size TEXT,
  remote_flag INT,
  country_year TEXT
);

CREATE TABLE ds.corruption (
  country TEXT,
  region TEXT,
  year INT,
  score NUMERIC,
  rank INT,
  sources TEXT,
  standardError NUMERIC,
  lowerCi NUMERIC,
  upperCi NUMERIC,
  country_code TEXT,
  country_year TEXT
);

CREATE TABLE ds.hpi_rus (
  year INT,
  score NUMERIC,
  rank INT,
  country TEXT,
  country_code TEXT,
  country_year TEXT
);

CREATE TABLE ds.inflation (
  country_name TEXT,
  year INT,
  inflation_rate NUMERIC,
  country_code TEXT,
  country_year TEXT
);

CREATE TABLE ds.unemployment (
  country TEXT,
  year INT,
  unemployment_rate NUMERIC,
  country_code TEXT,
  country_year TEXT
);

CREATE INDEX ON ds.salaries (work_year);
CREATE INDEX ON ds.salaries (job_title);
CREATE INDEX ON ds.corruption (country_code, year);
CREATE INDEX ON ds.hpi_rus (country_code, year);
CREATE INDEX ON ds.inflation (country_code, year);
CREATE INDEX ON ds.unemployment (country_code, year);