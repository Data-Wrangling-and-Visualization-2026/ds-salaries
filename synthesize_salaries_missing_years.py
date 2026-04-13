"""
synthesize_salaries_missing_years.py
─────────────────────────────────────
Extends DS salary coverage to all years 2020-2025 for every country
that has at least one real (non-synthetic) salary record.

The existing synthesize_salaries_2019.py only fills *within-range* gaps
(years between a country's first and last observed year). This script
additionally handles:
  • Backward extrapolation — e.g. Russia has data from 2021; needs 2020.
  • Forward extrapolation  — e.g. Russia's last year is 2023; needs 2024-25.

Strategy
─────────
For each missing year inside the observed range:
  → Interpolate salary level between the two nearest neighbors.
  → Sample records from those neighbors (same as the original script).

For each missing year outside the observed range (extrapolation):
  → Apply cumulative global YoY growth rates (see GLOBAL_YOY_GROWTH) from
    the nearest boundary year to the target year.
  → Sample records from the boundary year and scale salaries accordingly.
  → Generate a modest number of records (capped at MAX_EXTRAPOLATED_PER_YEAR)
    to limit distortion of the global distribution.

The 2021→2022 global jump (+56 %) is a data-collection artefact (massive
expansion of Kaggle survey coverage, skewed towards high-paying US firms).
The extrapolation rate for that year is capped at +12 %.

All synthesized records are flagged salary_synthetic = True.

Input : data/preprocessed/DataScience_salaries_2025_clean.json
Output: data/preprocessed/DataScience_salaries_2025_complete.json
"""

import json
import logging
import math
import random
from pathlib import Path

import numpy as np
import pandas as pd

# ── Logger ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent
INPUT_PATH  = ROOT / "data/preprocessed/DataScience_salaries_2025_clean.json"
OUTPUT_PATH = ROOT / "data/preprocessed/DataScience_salaries_2025_complete.json"

# ── Parameters ────────────────────────────────────────────────────────────────
RANDOM_SEED               = 42
TARGET_YEARS              = list(range(2020, 2026))  # 2020 … 2025 inclusive
MIN_REAL_RECORDS          = 1    # country must have at least this many real rows
SALARY_NOISE_STD          = 0.07 # ±7 % Gaussian noise on scaled salaries
SALARY_FLOOR              = 10_000
SALARY_CEIL               = 500_000
MAX_EXTRAPOLATED_PER_YEAR = 10   # cap for years outside observed range
INTERPOLATION_NOISE_STD   = 0.05 # slightly tighter noise for interpolated years

# Global year-over-year growth rates used for extrapolation.
# Key = year Y  →  Value = growth rate relative to year Y-1.
# The 2021→2022 observed +56 % is a data-coverage artefact and is capped at +12 %.
GLOBAL_YOY_GROWTH: dict[int, float] = {
    2020:  0.050,   # vs 2019
    2021:  0.051,   # vs 2020 (observed)
    2022:  0.120,   # vs 2021 (capped; raw observed: +56 %)
    2023:  0.104,   # vs 2022 (observed)
    2024:  0.027,   # vs 2023 (observed)
    2025: -0.033,   # vs 2024 (observed)
}


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def cumulative_growth_factor(from_year: int, to_year: int) -> float:
    """
    Returns the multiplicative salary scale factor implied by global YoY
    growth rates when moving from `from_year` to `to_year`.

    Examples:
        cumulative_growth_factor(2021, 2023) ≈ 1.12 * 1.104 ≈ 1.237
        cumulative_growth_factor(2023, 2021) ≈ 1 / (1.12 * 1.104) ≈ 0.809
    """
    factor = 1.0
    if to_year == from_year:
        return factor
    if to_year > from_year:
        for yr in range(from_year + 1, to_year + 1):
            factor *= (1.0 + GLOBAL_YOY_GROWTH.get(yr, 0.05))
    else:
        for yr in range(from_year, to_year, -1):
            factor /= (1.0 + GLOBAL_YOY_GROWTH.get(yr, 0.05))
    return factor


def scale_salaries(
    sampled: pd.DataFrame,
    target_median: float,
    noise_std: float,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """Scales salary_in_usd so the new median matches target_median, adds noise."""
    current_median = sampled["salary_in_usd"].median()
    scale = target_median / current_median if current_median > 0 else 1.0
    noise = rng.normal(1.0, noise_std, size=len(sampled))
    new_salaries = (sampled["salary_in_usd"] * scale * noise).clip(SALARY_FLOOR, SALARY_CEIL).round().astype(int)
    sampled = sampled.copy()
    sampled["salary_in_usd"] = new_salaries
    sampled["salary"]        = new_salaries
    return sampled


def sample_n_from(
    pool: pd.DataFrame,
    n: int,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """Samples n rows from pool with replacement."""
    idx = rng.choice(len(pool), size=n, replace=True)
    return pool.iloc[idx].copy().reset_index(drop=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Gap analysis
# ═══════════════════════════════════════════════════════════════════════════════

def build_gap_plan(df_real: pd.DataFrame) -> list[dict]:
    """
    For every country with real records, identifies missing years in 2020-2025
    and classifies each gap as 'interpolate' or 'extrapolate'.

    Returns a list of dicts:
        {country, target_year, kind, lower_year, upper_year,
         lower_median, upper_median, n_generate, ref_year}
    """
    plan: list[dict] = []

    for country, grp in df_real.groupby("company_location"):
        years_with_data = sorted(grp["work_year"].unique())
        yr_min = years_with_data[0]
        yr_max = years_with_data[-1]
        years_set = set(years_with_data)
        year_medians = grp.groupby("work_year")["salary_in_usd"].median()
        year_counts  = grp.groupby("work_year").size()

        for target_yr in TARGET_YEARS:
            if target_yr in years_set:
                continue  # already has data

            # ── Interpolation (within observed range) ──────────────────────
            if yr_min < target_yr < yr_max:
                lower_yrs = [y for y in years_with_data if y < target_yr]
                upper_yrs = [y for y in years_with_data if y > target_yr]
                lo = max(lower_yrs)
                hi = min(upper_yrs)

                # Linear interpolation of salary level
                t = (target_yr - lo) / (hi - lo)
                target_median = year_medians[lo] + t * (year_medians[hi] - year_medians[lo])

                # N records = average of the two neighbor year counts
                n_gen = max(1, round((year_counts[lo] + year_counts[hi]) / 2))

                plan.append(dict(
                    country=country,
                    target_year=target_yr,
                    kind="interpolate",
                    lo_year=lo,
                    hi_year=hi,
                    target_median=float(target_median),
                    n_generate=n_gen,
                    ref_year=lo,           # sample from lower neighbor
                ))

            # ── Backward extrapolation (before observed range) ─────────────
            elif target_yr < yr_min:
                ref_year = yr_min
                ref_median = float(year_medians[yr_min])
                factor = cumulative_growth_factor(ref_year, target_yr)
                target_median = ref_median * factor

                n_ref = int(year_counts[ref_year])
                n_gen = max(2, min(MAX_EXTRAPOLATED_PER_YEAR,
                                   max(2, math.ceil(math.sqrt(n_ref)))))

                plan.append(dict(
                    country=country,
                    target_year=target_yr,
                    kind="extrapolate_backward",
                    lo_year=None,
                    hi_year=None,
                    target_median=float(target_median),
                    n_generate=n_gen,
                    ref_year=ref_year,
                ))

            # ── Forward extrapolation (after observed range) ───────────────
            else:  # target_yr > yr_max
                ref_year = yr_max
                ref_median = float(year_medians[yr_max])
                factor = cumulative_growth_factor(ref_year, target_yr)
                target_median = ref_median * factor

                n_ref = int(year_counts[ref_year])
                n_gen = max(2, min(MAX_EXTRAPOLATED_PER_YEAR,
                                   max(2, math.ceil(math.sqrt(n_ref)))))

                plan.append(dict(
                    country=country,
                    target_year=target_yr,
                    kind="extrapolate_forward",
                    lo_year=None,
                    hi_year=None,
                    target_median=float(target_median),
                    n_generate=n_gen,
                    ref_year=ref_year,
                ))

    return plan


# ═══════════════════════════════════════════════════════════════════════════════
# Synthesis
# ═══════════════════════════════════════════════════════════════════════════════

def execute_plan(
    df_real: pd.DataFrame,
    plan: list[dict],
    rng: np.random.Generator,
) -> pd.DataFrame:
    """Generates synthetic records according to the gap plan."""
    all_new: list[pd.DataFrame] = []
    kind_counts: dict[str, int] = {}

    for item in plan:
        country    = item["country"]
        target_yr  = item["target_year"]
        kind       = item["kind"]
        ref_year   = item["ref_year"]
        target_med = item["target_median"]
        n_gen      = item["n_generate"]

        # Clamp target_median to realistic range
        target_med = float(np.clip(target_med, SALARY_FLOOR, SALARY_CEIL))

        # Pool to sample categorical fields from
        country_df = df_real[df_real["company_location"] == country]
        pool = country_df[country_df["work_year"] == ref_year]
        if pool.empty:
            pool = country_df  # fallback to any year for this country

        sampled = sample_n_from(pool, n_gen, rng)
        noise_std = INTERPOLATION_NOISE_STD if kind == "interpolate" else SALARY_NOISE_STD
        sampled = scale_salaries(sampled, target_med, noise_std, rng)

        sampled["work_year"]        = target_yr
        sampled["country_year"]     = f"{country}{target_yr}"
        sampled["salary_synthetic"] = True

        all_new.append(sampled)
        kind_counts[kind] = kind_counts.get(kind, 0) + n_gen

        log.debug(
            "  %s  %d → %d records  (kind=%s, ref=%d, target_median=$%d)",
            country, target_yr, n_gen, kind, ref_year, int(target_med),
        )

    if not all_new:
        return pd.DataFrame()

    df_new = pd.concat(all_new, ignore_index=True)
    log.info(
        "Generated %d synthetic records: %d interpolated, %d backward, %d forward",
        len(df_new),
        kind_counts.get("interpolate", 0),
        kind_counts.get("extrapolate_backward", 0),
        kind_counts.get("extrapolate_forward", 0),
    )
    return df_new


# ═══════════════════════════════════════════════════════════════════════════════
# Reporting
# ═══════════════════════════════════════════════════════════════════════════════

def log_country_summary(df_real: pd.DataFrame, df_synth: pd.DataFrame) -> None:
    """Logs per-country coverage before and after synthesis."""
    all_data = pd.concat([df_real, df_synth], ignore_index=True) if not df_synth.empty else df_real
    before_coverage: dict[str, set] = {}
    after_coverage:  dict[str, set] = {}
    target_set = set(TARGET_YEARS)

    for country, grp in df_real.groupby("company_location"):
        real_count = (grp["salary_synthetic"] == False).sum()  # noqa: E712
        if real_count > 0:
            before_coverage[country] = set(grp["work_year"].unique()) & target_set

    for country, grp in all_data.groupby("company_location"):
        if country in before_coverage:
            after_coverage[country] = set(grp["work_year"].unique()) & target_set

    log.info("Coverage changes (countries with real data):")
    for country in sorted(before_coverage.keys()):
        before = sorted(before_coverage.get(country, set()))
        after  = sorted(after_coverage.get(country, set()))
        if before != after:
            added = sorted(set(after) - set(before))
            log.info("  %-6s  %s → %s  (+%s)", country, before, after, added)


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED)
    random.seed(RANDOM_SEED)

    # 1. Load
    log.info("Loading %s …", INPUT_PATH)
    with open(INPUT_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    df = pd.DataFrame(raw)
    df["work_year"] = pd.to_numeric(df["work_year"], errors="coerce").astype("Int64")
    df["salary_synthetic"] = df.get("salary_synthetic", pd.Series(False, index=df.index)).fillna(False)
    log.info("Loaded %d records (%d years, %d countries)",
             len(df),
             df["work_year"].nunique(),
             df["company_location"].nunique())

    # 2. Identify countries with real data
    df_real = df[df["salary_synthetic"] == False].copy()  # noqa: E712
    real_countries = df_real.groupby("company_location").size()
    real_countries = real_countries[real_countries >= MIN_REAL_RECORDS].index.tolist()
    log.info("Countries with real data: %d", len(real_countries))

    df_real_filtered = df_real[df_real["company_location"].isin(real_countries)].copy()

    # 3. Build gap plan
    plan = build_gap_plan(df_real_filtered)
    interp  = sum(1 for p in plan if p["kind"] == "interpolate")
    bwd     = sum(1 for p in plan if p["kind"] == "extrapolate_backward")
    fwd     = sum(1 for p in plan if p["kind"] == "extrapolate_forward")
    log.info(
        "Gap plan: %d country-year slots  (%d interpolate, %d backward, %d forward)",
        len(plan), interp, bwd, fwd,
    )

    # 4. Execute
    df_synth = execute_plan(df_real_filtered, plan, rng)

    # 5. Log country coverage
    log_country_summary(df_real_filtered, df_synth)

    # 6. Merge: original records + new synthetic records
    df["salary_synthetic"] = df["salary_synthetic"].astype(bool)
    parts = [df]
    if not df_synth.empty:
        df_synth["salary_synthetic"] = True
        parts.append(df_synth)

    df_all = pd.concat(parts, ignore_index=True)
    df_all = df_all.sort_values(["work_year", "company_location"]).reset_index(drop=True)

    total      = len(df_all)
    n_synth    = int(df_all["salary_synthetic"].sum())
    n_original = total - n_synth

    log.info(
        "Final dataset: %d records total | %d original (%.1f%%) | %d synthesized (%.1f%%)",
        total, n_original, 100 * n_original / total,
        n_synth,          100 * n_synth / total,
    )
    log.info("Records by year:\n%s",
             df_all.groupby(["work_year", "salary_synthetic"]).size()
                   .unstack(fill_value=0).to_string())

    # 7. Save
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    records = df_all.where(df_all.notna(), other=None).to_dict(orient="records")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    log.info("Saved → %s (%d records)", OUTPUT_PATH, len(records))

    # 8. Quick validation
    df_check = pd.DataFrame(records)
    df_check = df_check[df_check["salary_synthetic"] == False]  # noqa: E712
    countries_missing = []
    for country in real_countries:
        covered = set(df_all[df_all["company_location"] == country]["work_year"].unique())
        missing = [y for y in TARGET_YEARS if y not in covered]
        if missing:
            countries_missing.append((country, missing))

    if countries_missing:
        log.warning("Countries still missing some target years: %s", countries_missing[:10])
    else:
        log.info("✓ All %d countries now have data for every year in %s",
                 len(real_countries), TARGET_YEARS)


if __name__ == "__main__":
    main()
