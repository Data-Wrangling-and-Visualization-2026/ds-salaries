"""
synthesize_inflation.py
───────────────────────
Synthesizes missing inflation rate values for 2015–2024.

The source dataset covers only 2019–2023 for all 177 countries.
This script fills:
  • 2015–2018  via backward extrapolation from the 2019–2023 trend
  • 2024       via forward  extrapolation from the 2019–2023 trend

Strategy:
  For each country, a linear trend is fitted to the 5 available years.
  Left-edge gaps (2015–2018) use the slope from the earliest EXTRAPOLATION_WINDOW
  known points; right-edge gap (2024) uses the slope from the latest
  EXTRAPOLATION_WINDOW known points.  Small Gaussian noise (σ = NOISE_STD)
  is added to avoid perfectly linear synthetic series.  Results are clipped
  to [INFLATION_MIN, INFLATION_MAX] to prevent physically implausible values.

  There are no internal gaps in the source data (every country has exactly
  2019–2023), so no interpolation step is required.

All synthesized rows are flagged with `inflation_synthetic = True`.
Original records receive `inflation_synthetic = False`.

Input : data/preprocessed/inflation_rate_clean.json
Output: data/preprocessed/inflation_rate_synthesized.json
"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

# ── Logger ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT        = Path.cwd()
INPUT_PATH  = ROOT / "data/preprocessed/inflation_rate_clean.json"
OUTPUT_PATH = ROOT / "data/preprocessed/inflation_rate_synthesized.json"

# ── Parameters ────────────────────────────────────────────────────────────────
TARGET_YEARS         = list(range(2015, 2025))
EXTRAPOLATION_WINDOW = 3      # number of edge points used to estimate the slope
NOISE_STD            = 0.02   # relative Gaussian noise added to extrapolated values
INFLATION_MIN        = -50.0  # hard lower bound (%) — deflation floor
INFLATION_MAX        = 2000.0 # hard upper bound (%) — covers known hyperinflation cases
RANDOM_SEED          = 42


# ═══════════════════════════════════════════════════════════════════════════
# Step 1 – Load and audit
# ═══════════════════════════════════════════════════════════════════════════

def load_data(path: Path) -> pd.DataFrame:
    log.info("Loading data: %s", path)
    with open(path) as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    df = df.sort_values(["country_code", "year"]).reset_index(drop=True)

    years    = sorted(df["year"].unique())
    n_ctry   = df["country_code"].nunique()
    n_null   = int(df["inflation_rate"].isna().sum())

    log.info(
        "Records: %d | Countries: %d | Years: %s | Null inflation_rate: %d",
        len(df), n_ctry, years, n_null,
    )
    return df


def audit_missing(df: pd.DataFrame) -> None:
    existing   = set(zip(df["country_code"], df["year"]))
    countries  = sorted(df["country_code"].unique())
    missing    = [(c, y) for c in countries for y in TARGET_YEARS if (c, y) not in existing]
    by_year    = {}
    for _, y in missing:
        by_year[y] = by_year.get(y, 0) + 1
    log.info("Missing country-year slots in %s: %d", TARGET_YEARS, len(missing))
    log.info("Missing by year: %s", dict(sorted(by_year.items())))


# ═══════════════════════════════════════════════════════════════════════════
# Step 2 – Build complete grid
# ═══════════════════════════════════════════════════════════════════════════

def create_full_grid(df: pd.DataFrame) -> tuple[pd.DataFrame, set]:
    """
    Inserts NaN rows for every (country, year) in TARGET_YEARS that is absent.
    Returns the expanded DataFrame and the set of added (country_code, year) keys.
    """
    country_meta = (
        df[["country_code", "country_name"]]
        .drop_duplicates("country_code")
        .set_index("country_code")
    )

    existing   = set(zip(df["country_code"], df["year"]))
    added_keys: set = set()
    new_rows: list[dict] = []

    for code, meta in country_meta.iterrows():
        for year in TARGET_YEARS:
            if (code, year) not in existing:
                new_rows.append({
                    "country_name":    meta["country_name"],
                    "country_code":    code,
                    "year":            year,
                    "inflation_rate":  np.nan,
                    "country_year":    f"{code}{year}",
                })
                added_keys.add((code, year))

    if new_rows:
        df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)

    df = df.sort_values(["country_code", "year"]).reset_index(drop=True)
    log.info("Grid expanded: +%d NaN rows added for %d countries × %d missing years",
             len(added_keys), df["country_code"].nunique(),
             len(added_keys) // max(1, df["country_code"].nunique()))
    return df, added_keys


# ═══════════════════════════════════════════════════════════════════════════
# Step 3 – Extrapolate per country
# ═══════════════════════════════════════════════════════════════════════════

def _linear_extrapolate(series: pd.Series, n_points: int) -> pd.Series:
    """
    Fills NaNs at both edges of a year-indexed Series via linear extrapolation.
    Uses `n_points` known edge values to estimate the slope.

    Backward extrapolation (left edge) is clamped to the country's own observed
    range: [min_known * 0.5, max_known * 1.5].  This prevents runaway values for
    countries that experienced sudden hyperinflation or deflation crises, where a
    linear backward trend from the crisis period would produce physically
    implausible estimates.  Forward extrapolation (right edge, year 2024) uses
    unclamped linear projection — only one year ahead, so divergence is limited.
    """
    s         = series.copy()
    known_idx = s.dropna().index.tolist()
    if len(known_idx) < 2:
        return s

    known_min = float(s.dropna().min())
    known_max = float(s.dropna().max())
    back_lo   = known_min * 0.5 if known_min >= 0 else known_min * 1.5
    back_hi   = known_max * 1.5

    # Left edge (backward extrapolation)
    left_known = known_idx[:n_points]
    if len(left_known) >= 2:
        lx = np.array(left_known, dtype=float)
        ly = s[left_known].values
        slope, intercept = np.polyfit(lx, ly, 1)
        for i in s.index:
            if pd.isna(s[i]) and i < known_idx[0]:
                val = slope * float(i) + intercept
                s[i] = float(np.clip(val, back_lo, back_hi))

    # Right edge (forward extrapolation — only 1 year ahead for inflation)
    right_known = known_idx[-n_points:]
    if len(right_known) >= 2:
        rx = np.array(right_known, dtype=float)
        ry = s[right_known].values
        slope, intercept = np.polyfit(rx, ry, 1)
        for i in s.index:
            if pd.isna(s[i]) and i > known_idx[-1]:
                s[i] = slope * float(i) + intercept

    return s


def extrapolate_per_country(
    df: pd.DataFrame, rng: np.random.Generator
) -> pd.DataFrame:
    """
    For each country, extrapolates inflation_rate into all missing TARGET_YEARS.
    Backward gaps (2015–2018) are filled using a slope clamped to the country's
    own observed range to prevent runaway values.
    Forward gap (2024) uses an unclamped linear trend from the most recent years.
    Small Gaussian noise (σ = NOISE_STD) is added to avoid flat synthetic series.
    """
    log.info("Step 1: linear extrapolation per country …")
    df = df.copy()

    filled_total = 0

    for code, grp in df.groupby("country_code"):
        idx   = grp.index
        years = grp["year"].values
        s     = pd.Series(grp["inflation_rate"].values.astype(float), index=years)

        before   = s.isna().sum()
        s_extrap = _linear_extrapolate(s, n_points=EXTRAPOLATION_WINDOW)
        after    = s_extrap.isna().sum()
        n_filled = int(before - after)

        if n_filled > 0:
            # Add relative Gaussian noise (scale by absolute value) to synthesised
            # positions so the series does not look artificially linear
            noise_mask = s.isna() & s_extrap.notna()
            noise      = rng.normal(1.0, NOISE_STD, size=int(noise_mask.sum()))
            s_extrap[noise_mask] = (s_extrap[noise_mask] * noise).clip(
                lower=INFLATION_MIN, upper=INFLATION_MAX
            )
            filled_total += n_filled

        df.loc[idx, "inflation_rate"] = s_extrap.values

    log.info("  Extrapolated: %d country-year values", filled_total)
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 4 – Mark synthetic and save
# ═══════════════════════════════════════════════════════════════════════════

def finalize(
    df_original: pd.DataFrame,
    df_filled: pd.DataFrame,
    added_keys: set,
) -> pd.DataFrame:
    df = df_filled.copy()

    # Global clip safety pass
    df["inflation_rate"] = df["inflation_rate"].clip(
        lower=INFLATION_MIN, upper=INFLATION_MAX
    )

    # Round to 2 decimal places (matches original precision)
    df["inflation_rate"] = df["inflation_rate"].round(2)

    synthetic_mask = df.apply(
        lambda row: (row["country_code"], row["year"]) in added_keys, axis=1
    )
    df["inflation_synthetic"] = synthetic_mask

    synth_count = int(df["inflation_synthetic"].sum())
    still_null  = int(df["inflation_rate"].isna().sum())

    log.info("Synthesized rows: %d", synth_count)
    if still_null:
        log.warning("Rows still with null inflation_rate: %d", still_null)
    else:
        log.info("All missing values filled ✓")

    return df


def save_output(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = []
    for rec in df.to_dict(orient="records"):
        clean = {}
        for k, v in rec.items():
            if hasattr(v, "item"):
                v = v.item()
            if v != v:          # NaN guard
                v = None
            clean[k] = v
        records.append(clean)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=4, ensure_ascii=False)
    log.info("Saved: %s (%d records)", path, len(records))


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED)

    # 1. Load and audit
    df_original = load_data(INPUT_PATH)
    audit_missing(df_original)

    # 2. Build complete grid
    df_grid, added_keys = create_full_grid(df_original)

    # 3. Extrapolate
    df_step1 = extrapolate_per_country(df_grid, rng)

    remaining = int(df_step1["inflation_rate"].isna().sum())
    log.info("After extrapolation, null values remaining: %d", remaining)

    # 4. Mark synthetic and save
    df_final = finalize(df_original, df_step1, added_keys)
    save_output(df_final, OUTPUT_PATH)

    # Summary
    synth = df_final[df_final["inflation_synthetic"]]
    log.info(
        "Synthesized rows by year:\n%s",
        synth.groupby("year")["inflation_synthetic"].count().to_string(),
    )

    # Spot-check extremes
    ext = df_final.nlargest(5, "inflation_rate")[
        ["country_code", "year", "inflation_rate", "inflation_synthetic"]
    ]
    log.info("Top 5 inflation rows:\n%s", ext.to_string(index=False))


if __name__ == "__main__":
    main()
