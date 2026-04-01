"""
synthesize_unemployment.py
──────────────────────────
Synthesizes missing unemployment rate values for 2015–2024.

The dataset covers 56 countries × 10 years (2015–2024) = 560 records,
but 36 records have null unemployment_rate.  The nulls split into two
distinct cases that require different methods:

  Case A — partial nulls (country has some known values):
    • KGZ 2024        — 1 right-edge null   → extrapolation
    • TJK 2020        — 1 internal null      → interpolation
    • TJK 2024        — 1 right-edge null   → extrapolation
    • UKR 2022–2024   — 3 right-edge nulls  → extrapolation

  Case B — complete nulls (all 10 years are null; ILO reporting gaps):
    • MCO (Monaco)       — all 10 years null → global KNN fallback
    • RUS (Russia)       — all 10 years null → global KNN fallback
    • TKM (Turkmenistan) — all 10 years null → global KNN fallback

Strategy:
  1. Temporal interpolation for internal gaps, linear extrapolation for
     boundary gaps  (covers Case A).
  2. Global KNN imputation in wide format (rows = countries, cols = years)
     for countries that remain all-null after Step 1  (covers Case B).
     sklearn.impute.KNNImputer falls back to column means for all-NaN rows.

All previously-null values are flagged with `unemployment_synthetic = True`.
Records that already had a value receive `unemployment_synthetic = False`.

Input : data/preprocessed/unemployement_rate_clean.json
Output: data/preprocessed/unemployement_rate_synthesized.json
"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import KNNImputer

# ── Logger ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT        = Path.cwd()
INPUT_PATH  = ROOT / "data/preprocessed/unemployement_rate_clean.json"
OUTPUT_PATH = ROOT / "data/preprocessed/unemployement_rate_synthesized.json"

# ── Parameters ────────────────────────────────────────────────────────────────
KNN_NEIGHBORS         = 5
MAX_CONSEC_GAP_INTERP = 6    # max consecutive NaNs for interpolation
EXTRAPOLATION_WINDOW  = 3    # number of edge points used for slope estimation
UNEMPLOYMENT_CLIP     = (0.0, 50.0)   # valid range for unemployment rate (%)


# ═══════════════════════════════════════════════════════════════════════════
# Step 1 – Load and audit
# ═══════════════════════════════════════════════════════════════════════════

def load_data(path: Path) -> pd.DataFrame:
    log.info("Loading data: %s", path)
    with open(path) as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    df = df.sort_values(["country_code", "year"]).reset_index(drop=True)

    total = len(df)
    nulls = int(df["unemployment_rate"].isna().sum())
    years = sorted(df["year"].unique())
    log.info("Records: %d | Countries: %d | Years: %s | Null values: %d",
             total, df["country_code"].nunique(), years, nulls)
    return df


def audit_missing(df: pd.DataFrame) -> None:
    null_by_country = (
        df[df["unemployment_rate"].isna()]
        .groupby("country_code")["year"]
        .apply(sorted)
    )
    log.info("Null unemployment_rate by country:")
    for code, years in null_by_country.items():
        country = df.loc[df["country_code"] == code, "country"].iloc[0]
        log.info("  %s (%s): %s", code, country, list(years))


# ═══════════════════════════════════════════════════════════════════════════
# Step 2 – Temporal interpolation / extrapolation (Case A)
# ═══════════════════════════════════════════════════════════════════════════

def _linear_extrapolate(series: pd.Series, n_points: int) -> pd.Series:
    """
    Fills NaNs at both edges of a year-indexed Series via linear extrapolation.
    Uses `n_points` known values from each edge for the slope estimate.
    Does NOT clip — caller applies domain-specific bounds.
    """
    s         = series.copy()
    known_idx = s.dropna().index.tolist()
    if len(known_idx) < 2:
        return s

    # Left edge (backward extrapolation)
    left_known = known_idx[:n_points]
    if len(left_known) >= 2:
        lx = np.array(left_known, dtype=float)
        ly = s[left_known].values
        slope, intercept = np.polyfit(lx, ly, 1)
        for i in s.index:
            if pd.isna(s[i]) and i < known_idx[0]:
                s[i] = slope * float(i) + intercept

    # Right edge (forward extrapolation)
    right_known = known_idx[-n_points:]
    if len(right_known) >= 2:
        rx = np.array(right_known, dtype=float)
        ry = s[right_known].values
        slope, intercept = np.polyfit(rx, ry, 1)
        for i in s.index:
            if pd.isna(s[i]) and i > known_idx[-1]:
                s[i] = slope * float(i) + intercept

    return s


def interpolate_by_country(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each country, applies linear interpolation (internal gaps) then
    linear extrapolation (boundary gaps) to unemployment_rate.
    Countries with ALL-null values are skipped — they are handled by KNN.
    """
    log.info("Step 1: temporal interpolation / extrapolation per country …")
    df = df.copy()

    lo, hi = UNEMPLOYMENT_CLIP
    filled_interp  = 0
    filled_extrap  = 0
    skipped_all_null = []

    for code, grp in df.groupby("country_code"):
        idx   = grp.index
        years = grp["year"].values
        s     = pd.Series(grp["unemployment_rate"].values.astype(float), index=years)

        # Skip countries that are entirely null — KNN handles them in Step 2
        if s.isna().all():
            skipped_all_null.append(code)
            continue

        # Internal interpolation
        s_interp = s.interpolate(
            method="linear", limit=MAX_CONSEC_GAP_INTERP, limit_direction="both"
        )
        filled_interp += int((s_interp.notna() & s.isna()).sum())

        # Boundary extrapolation
        s_extrap = _linear_extrapolate(s_interp, n_points=EXTRAPOLATION_WINDOW)
        filled_extrap += int((s_extrap.notna() & s_interp.isna()).sum())

        # Clip to valid range
        s_extrap = s_extrap.clip(lower=lo, upper=hi)
        df.loc[idx, "unemployment_rate"] = s_extrap.values

    log.info("  Interpolated: %d | Extrapolated: %d", filled_interp, filled_extrap)
    if skipped_all_null:
        log.info("  Skipped (all-null, sent to KNN): %s", skipped_all_null)
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 3 – Global KNN imputation (Case B: all-null countries)
# ═══════════════════════════════════════════════════════════════════════════

def knn_impute_global(df: pd.DataFrame) -> pd.DataFrame:
    """
    Applies KNNImputer in wide format (rows = countries, columns = years)
    across all 56 countries.  Handles all-null rows: sklearn falls back to
    column means (global mean per year) when no non-null features are shared.
    """
    remaining = int(df["unemployment_rate"].isna().sum())
    if remaining == 0:
        log.info("Step 2: no missing values left — KNN not needed.")
        return df

    log.info("Step 2: global KNN imputation (k=%d) for %d remaining null(s) …",
             KNN_NEIGHBORS, remaining)

    df    = df.copy()
    years = sorted(df["year"].unique())
    lo, hi = UNEMPLOYMENT_CLIP

    all_codes = sorted(df["country_code"].unique())
    wide = (
        df.pivot_table(
            index="country_code", columns="year",
            values="unemployment_rate", aggfunc="first",
        )
        .reindex(all_codes)   # restore all-NaN rows dropped by pivot_table
    )

    k = min(KNN_NEIGHBORS, len(wide) - 1)
    imputer    = KNNImputer(n_neighbors=k)
    wide_filled = pd.DataFrame(
        imputer.fit_transform(wide),
        index=wide.index,
        columns=wide.columns,
    ).clip(lower=lo, upper=hi)

    filled_knn = 0
    for code in wide.index:
        mask = (df["country_code"] == code) & df["unemployment_rate"].isna()
        for yr in years:
            cell_mask = mask & (df["year"] == yr)
            if cell_mask.any():
                df.loc[cell_mask, "unemployment_rate"] = wide_filled.at[code, yr]
                filled_knn += 1

    log.info("  KNN filled: %d null(s)", filled_knn)
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 4 – Mark synthetic and save
# ═══════════════════════════════════════════════════════════════════════════

def finalize(original: pd.DataFrame, filled: pd.DataFrame) -> pd.DataFrame:
    """
    Marks previously-null records as `unemployment_synthetic = True`.
    Already-valid records receive `unemployment_synthetic = False`.
    """
    was_null = original["unemployment_rate"].isna()

    df = filled.copy()
    df["unemployment_synthetic"] = was_null & df["unemployment_rate"].notna()

    # Round to 1 decimal place (matches original precision)
    df["unemployment_rate"] = df["unemployment_rate"].round(1)

    synth_count = int(df["unemployment_synthetic"].sum())
    still_null  = int(df["unemployment_rate"].isna().sum())

    log.info("Synthesized values: %d", synth_count)
    if still_null:
        log.warning("Still null after synthesis: %d", still_null)
    else:
        log.info("All null values filled ✓")

    return df


def save_output(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = []
    for rec in df.to_dict(orient="records"):
        clean = {}
        for k, v in rec.items():
            if hasattr(v, "item"):
                v = v.item()
            if v != v:      # NaN guard
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
    # 1. Load and audit
    df_original = load_data(INPUT_PATH)
    audit_missing(df_original)

    # 2. Temporal interpolation / extrapolation (Case A)
    df_step1 = interpolate_by_country(df_original)

    remaining = int(df_step1["unemployment_rate"].isna().sum())
    log.info("After step 1, null values remaining: %d", remaining)

    # 3. Global KNN (Case B: all-null countries)
    df_step2 = knn_impute_global(df_step1)

    # 4. Mark synthetic and save
    df_final = finalize(df_original, df_step2)
    save_output(df_final, OUTPUT_PATH)

    # Summary
    synth = df_final[df_final["unemployment_synthetic"]]
    log.info(
        "Synthesized values by country:\n%s",
        synth.groupby("country_code")["unemployment_synthetic"].count().to_string(),
    )


if __name__ == "__main__":
    main()
