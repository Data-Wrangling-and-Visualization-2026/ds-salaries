"""
synthesize_salaries_2019.py
───────────────────────────
Synthesizes missing Data Science salary records:
  1. Generates 2019 records (year absent from the original dataset) by
     extrapolating backward from 2020–2022 distributions.
  2. Fills within-range temporal gaps for individual countries (2020–2025):
     countries that appear in some years but are absent in years between
     their first and last observed year.

Strategy (see salary_synthesis_method.md for details):
  1. 2019 generation — backward extrapolation of salary levels and
     sampling of categorical fields from 2020–2021 distributions with
     pre-COVID adjustments (lower remote ratio, no AI-era job titles).
  2. Gap filling — for each missing country-year within a country's
     active span, interpolate salary from neighboring years and sample
     categorical fields from those neighboring-year records.

All synthesized records are flagged with `salary_synthetic = True`.

Input : data/preprocessed/DataScience_salaries_2025_clean.json
Output: data/preprocessed/DataScience_salaries_2025_clean_synthesized.json
"""

import json
import logging
import random
from pathlib import Path

import numpy as np
import pandas as pd

# ── Logger setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT        = Path.cwd()
INPUT_PATH  = ROOT / "data/preprocessed/DataScience_salaries_2025_clean.json"
OUTPUT_PATH = ROOT / "data/preprocessed/DataScience_salaries_2025_clean_synthesized.json"

# ── Parameters ────────────────────────────────────────────────────────────────
RANDOM_SEED = 42

# 2019 synthesis
TARGET_2019_RECORDS  = 65     # target record count for 2019 (≈ 87% of 2020's 75)
SALARY_DEFLATION_RATE = 0.07  # 2019 salaries ~7% below 2020 (pre-tech-boom baseline)
REMOTE_RATIO_2019    = 0.12   # pre-COVID: ~12% remote (vs 48% in 2020)

# Job titles that plausibly existed in 2019 (pre-AI/LLM era)
JOB_TITLES_2019_WHITELIST = {
    "Data Scientist", "Data Engineer", "Data Analyst",
    "Machine Learning Engineer", "Research Scientist", "Data Architect",
    "Business Intelligence Engineer", "Machine Learning Researcher",
    "Applied Scientist", "Statistician", "Data Science Manager",
    "Head of Data", "Director of Data Science", "Principal Data Scientist",
    "Lead Data Scientist", "Lead Data Analyst", "Lead Data Engineer",
    "Senior Data Scientist", "Senior Data Engineer", "Senior Data Analyst",
    "Software Engineer", "Research Engineer",
}

# ── Currency → country mapping used when re-sampling 2019 records ─────────────
# (inferred from the 2020-2021 dominant currency per country)
COUNTRY_CURRENCY_MAP = {
    "USA": "USD", "GBR": "GBP", "DEU": "EUR", "FRA": "EUR",
    "CAN": "CAD", "IND": "INR", "ESP": "EUR", "JPN": "JPY",
    "DNK": "DKK", "SGP": "SGD", "AUS": "AUD", "PRT": "EUR",
    "NLD": "EUR", "ITA": "EUR", "CHE": "CHF", "BEL": "EUR",
    "MEX": "MXN", "BRA": "BRL", "NGA": "NGN", "HUN": "HUF",
    "LUX": "EUR",
}


# ═══════════════════════════════════════════════════════════════════════════════
# Data loading & audit
# ═══════════════════════════════════════════════════════════════════════════════

def load_data(path: Path) -> pd.DataFrame:
    log.info("Loading data: %s", path)
    with open(path) as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    log.info("Records loaded: %d", len(df))
    log.info("Years present: %s", sorted(df["work_year"].unique()))
    return df


def audit_gaps(df: pd.DataFrame) -> None:
    """Prints year distribution and identifies within-range temporal gaps."""
    log.info("Records by year:\n%s", df.groupby("work_year").size().to_string())

    gaps_found = 0
    for country, grp in df.groupby("company_location"):
        years_present = set(grp["work_year"].unique())
        yr_min, yr_max = min(years_present), max(years_present)
        missing = sorted(set(range(yr_min, yr_max + 1)) - years_present)
        if missing:
            gaps_found += len(missing)
    log.info("Within-range temporal gaps (country-years): %d", gaps_found)


# ═══════════════════════════════════════════════════════════════════════════════
# Step 1 — Synthesize 2019 records
# ═══════════════════════════════════════════════════════════════════════════════

def _weighted_sample(series: pd.Series, n: int, rng: np.random.Generator) -> list:
    """Samples n values from a series proportionally to their frequencies."""
    counts = series.value_counts(normalize=True)
    return rng.choice(counts.index.tolist(), size=n, p=counts.values).tolist()


def synthesize_2019(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """
    Generates synthetic 2019 records by backward extrapolation from 2020–2022.

    Approach:
    - Salary: Apply deflation relative to the 2020 median salary level.
      Year-over-year changes are estimated from observed 2020–2022 medians.
    - Categorical fields (experience_level, employment_type, company_size,
      job_title, country) are sampled from 2020–2021 distributions.
    - Remote ratio is set to the pre-COVID baseline (~12%).
    - Job titles implausible in 2019 (AI-era titles) are excluded.
    """
    log.info("Step 1: synthesizing 2019 records …")

    # Use 2020-2021 as the reference pool (earliest available data)
    ref = df[df["work_year"].isin([2020, 2021])].copy()

    # Filter job titles to those plausible in 2019
    ref_valid_titles = ref[ref["job_title"].isin(JOB_TITLES_2019_WHITELIST)]
    if len(ref_valid_titles) < 10:
        ref_valid_titles = ref  # fallback: use all

    n = TARGET_2019_RECORDS

    # --- Salary generation ---
    # Observed medians: 2020=$79,833  2021=$83,872  2022=$131,300
    # 2019 baseline: apply deflation from 2020 median
    median_2020 = ref["salary_in_usd"].median()
    median_2019 = median_2020 * (1 - SALARY_DEFLATION_RATE)

    # Sample from a log-normal distribution calibrated to 2020 data
    ref_log = np.log(ref["salary_in_usd"].clip(lower=1))
    log_mu  = np.log(median_2019)  # shift median to 2019 level
    log_std = ref_log.std()
    raw_salaries = rng.lognormal(mean=log_mu, sigma=log_std, size=n)
    salaries_usd = np.clip(raw_salaries, 15_000, 400_000).astype(int)

    # --- Categorical fields ---
    countries    = _weighted_sample(ref_valid_titles["company_location"], n, rng)
    exp_levels   = _weighted_sample(ref["experience_level"], n, rng)
    emp_types    = _weighted_sample(ref["employment_type"], n, rng)
    comp_sizes   = _weighted_sample(ref["company_size"], n, rng)
    job_titles   = _weighted_sample(ref_valid_titles["job_title"], n, rng)

    # Remote flag: pre-COVID baseline (~12% remote)
    remote_flags = (rng.random(n) < REMOTE_RATIO_2019).astype(int).tolist()

    # Currency: derive from company_location or fallback to USD
    currencies = [COUNTRY_CURRENCY_MAP.get(c, "USD") for c in countries]

    records = []
    for i in range(n):
        country = countries[i]
        sal_usd = int(salaries_usd[i])

        records.append({
            "work_year":          2019,
            "experience_level":   exp_levels[i],
            "employment_type":    emp_types[i],
            "job_title":          job_titles[i],
            "salary":             sal_usd,        # original currency not available; store USD
            "salary_currency":    currencies[i],
            "salary_in_usd":      sal_usd,
            "employee_residence": country,
            "company_location":   country,
            "company_size":       comp_sizes[i],
            "remote_flag":        remote_flags[i],
            "country_year":       f"{country}2019",
            "salary_synthetic":   True,
        })

    df_2019 = pd.DataFrame(records)
    median_val = df_2019["salary_in_usd"].median()
    log.info(
        "  Generated %d records for 2019 | median salary_in_usd: $%d",
        len(df_2019),
        int(median_val),
    )
    return df_2019


# ═══════════════════════════════════════════════════════════════════════════════
# Step 2 — Fill within-range temporal gaps (2020–2025)
# ═══════════════════════════════════════════════════════════════════════════════

def _interpolate_salary_level(df: pd.DataFrame, country: str, target_year: int) -> float:
    """
    Estimates the salary scale factor for (country, target_year) by
    linear interpolation between the nearest available years for that country.
    Returns a multiplier relative to the global median of neighboring records.
    """
    grp = df[df["company_location"] == country].copy()
    year_medians = grp.groupby("work_year")["salary_in_usd"].median()

    if len(year_medians) < 2:
        return 1.0  # not enough data for interpolation

    years = np.array(year_medians.index, dtype=float)
    medians = year_medians.values.astype(float)

    # Linear interpolation / extrapolation
    interp_median = np.interp(target_year, years, medians)
    return float(interp_median)


def fill_temporal_gaps(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """
    For each country whose records span years Y_min … Y_max, fills any missing
    year within that range by:
      1. Identifying the nearest neighboring years with actual records.
      2. Sampling N records from those neighbors (N = average of neighbor counts).
      3. Adjusting salary_in_usd by the interpolated salary level.
      4. Setting work_year and country_year to the target year.
    """
    log.info("Step 2: filling within-range temporal gaps (2020–2025) …")

    gap_records: list[dict] = []
    gap_summary: list[tuple] = []

    for country, grp in df.groupby("company_location"):
        years_present = sorted(grp["work_year"].unique())
        yr_min, yr_max = years_present[0], years_present[-1]
        missing_years = sorted(set(range(yr_min, yr_max + 1)) - set(years_present))

        if not missing_years:
            continue

        for target_yr in missing_years:
            # Find the nearest available years on both sides
            lower_yrs = [y for y in years_present if y < target_yr]
            upper_yrs = [y for y in years_present if y > target_yr]
            neighbor_yrs = []
            if lower_yrs:
                neighbor_yrs.append(max(lower_yrs))
            if upper_yrs:
                neighbor_yrs.append(min(upper_yrs))

            neighbor_records = grp[grp["work_year"].isin(neighbor_yrs)]

            # Number of records to generate = average of neighbor counts
            neighbor_counts = [
                len(grp[grp["work_year"] == y]) for y in neighbor_yrs
            ]
            n_gen = max(1, int(round(np.mean(neighbor_counts))))

            # Salary scale: interpolated median for this country-year
            interp_median = _interpolate_salary_level(df, country, target_yr)
            neighbor_median = neighbor_records["salary_in_usd"].median()
            salary_scale = interp_median / neighbor_median if neighbor_median > 0 else 1.0

            # Sample categorical fields from neighboring records
            sample_idx = rng.choice(len(neighbor_records), size=n_gen, replace=True)
            sampled = neighbor_records.iloc[sample_idx].copy().reset_index(drop=True)

            # Add small Gaussian noise to salaries (±5%) to avoid clones
            noise = rng.normal(1.0, 0.05, size=n_gen)
            sampled["salary_in_usd"] = (
                (sampled["salary_in_usd"] * salary_scale * noise)
                .clip(lower=15_000)
                .round()
                .astype(int)
            )
            sampled["salary"]      = sampled["salary_in_usd"]
            sampled["work_year"]   = target_yr
            sampled["country_year"] = f"{country}{target_yr}"
            sampled["salary_synthetic"] = True

            gap_records.extend(sampled.to_dict(orient="records"))
            gap_summary.append((country, target_yr, n_gen))

    total_gap = len(gap_records)
    log.info(
        "  Filled %d country-year gaps | generated %d records",
        len(gap_summary),
        total_gap,
    )
    for country, yr, n in sorted(gap_summary):
        log.info("    %s %d → %d record(s)", country, yr, n)

    return pd.DataFrame(gap_records) if gap_records else pd.DataFrame()


# ═══════════════════════════════════════════════════════════════════════════════
# Step 3 — Merge, mark originals, and save
# ═══════════════════════════════════════════════════════════════════════════════

def merge_and_save(
    df_original: pd.DataFrame,
    df_2019: pd.DataFrame,
    df_gaps: pd.DataFrame,
    path: Path,
) -> pd.DataFrame:
    """
    Adds `salary_synthetic = False` to all original records, concatenates
    synthesized batches, sorts by year and country, and saves to JSON.
    """
    df_orig = df_original.copy()
    df_orig["salary_synthetic"] = False

    parts = [df_orig]
    if not df_2019.empty:
        parts.append(df_2019)
    if not df_gaps.empty:
        parts.append(df_gaps)

    df_all = pd.concat(parts, ignore_index=True)
    df_all = df_all.sort_values(["work_year", "company_location"]).reset_index(drop=True)

    # Summary
    synth_count = df_all["salary_synthetic"].sum()
    log.info(
        "Total records: %d | Original: %d | Synthesized: %d (%.1f%%)",
        len(df_all),
        len(df_original),
        synth_count,
        100 * synth_count / len(df_all),
    )
    log.info(
        "Records by year:\n%s",
        df_all.groupby(["work_year", "salary_synthetic"]).size().unstack(fill_value=0).to_string(),
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    records = df_all.to_dict(orient="records")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=4, ensure_ascii=False)
    log.info("Saved: %s (%d records)", path, len(records))

    return df_all


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED)
    random.seed(RANDOM_SEED)

    # 1. Load and audit
    df_original = load_data(INPUT_PATH)
    audit_gaps(df_original)

    # 2. Synthesize 2019
    df_2019 = synthesize_2019(df_original, rng)

    # 3. Fill within-range gaps (2020–2025)
    df_gaps = fill_temporal_gaps(df_original, rng)

    # 4. Merge and save
    merge_and_save(df_original, df_2019, df_gaps, OUTPUT_PATH)


if __name__ == "__main__":
    main()
