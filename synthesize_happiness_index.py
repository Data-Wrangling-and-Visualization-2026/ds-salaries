"""
synthesize_happiness_index.py
─────────────────────────────
Synthesizes missing Happy Planet Index (HPI) values for 2006–2021.

Strategy (see happiness_synthesis_method.md for details):
  1. Temporal interpolation/extrapolation per country (priority)
  2. KNN imputation within the same continent          (fallback)

Input data : data/preprocessed/hpi_clean.json
Output data: data/preprocessed/hpi_synthesized.json
"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import KNNImputer

# ── Logger setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ───────────────────────────────────────────────────────────────────
# The script resolves data relative to the current working directory (CWD).
# Run from the project root: python synthesize_happiness_index.py
ROOT = Path.cwd()
INPUT_PATH  = ROOT / "data/preprocessed/hpi_clean.json"
OUTPUT_PATH = ROOT / "data/preprocessed/hpi_synthesized.json"

# ── Parameters ───────────────────────────────────────────────────────────────
KNN_NEIGHBORS          = 5    # number of neighboring countries for KNN
MAX_CONSEC_GAP_INTERP  = 6    # max consecutive NaNs to interpolate
EXTRAPOLATION_WINDOW   = 3    # number of known points for linear extrapolation


# ═══════════════════════════════════════════════════════════════════════════
# Step 1 – Load and basic audit
# ═══════════════════════════════════════════════════════════════════════════

def load_data(path: Path) -> pd.DataFrame:
    log.info("Loading data: %s", path)
    with open(path) as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    df = df.sort_values(["country", "year"]).reset_index(drop=True)

    total    = len(df)
    missing  = df["hpi"].isna().sum()
    log.info("Records: %d | Missing HPI: %d (%.1f%%)", total, missing, 100 * missing / total)
    return df


def audit_missing(df: pd.DataFrame) -> None:
    """Prints a summary of missing values."""
    by_year = df.groupby("year")["hpi"].apply(lambda x: x.isna().sum())
    log.info("Missing by year:\n%s", by_year.to_string())

    per_country = df[df["hpi"].isna()].groupby("country")["year"].count()
    if not per_country.empty:
        log.info(
            "Top 10 countries with missing values:\n%s",
            per_country.sort_values(ascending=False).head(10).to_string(),
        )


# ═══════════════════════════════════════════════════════════════════════════
# Step 2 – Temporal interpolation / extrapolation per country
# ═══════════════════════════════════════════════════════════════════════════

def _linear_extrapolate(series: pd.Series, n_points: int) -> pd.Series:
    """
    Extrapolates NaNs at the edges of a time series using a linear trend.
    Uses `n_points` known points from each edge.
    """
    s = series.copy()
    known_idx = s.dropna().index.tolist()
    if len(known_idx) < 2:
        return s  # not enough data

    # Left edge (missing values before the first known value)
    left_known = known_idx[:n_points]
    if len(left_known) >= 2:
        left_x = np.array(left_known, dtype=float)
        left_y = s[left_known].values
        slope, intercept = np.polyfit(left_x, left_y, 1)
        for i in s.index:
            if pd.isna(s[i]) and i < known_idx[0]:
                val = slope * i + intercept
                s[i] = np.clip(val, 0, 100)

    # Right edge (missing values after the last known value)
    right_known = known_idx[-n_points:]
    if len(right_known) >= 2:
        right_x = np.array(right_known, dtype=float)
        right_y = s[right_known].values
        slope, intercept = np.polyfit(right_x, right_y, 1)
        for i in s.index:
            if pd.isna(s[i]) and i > known_idx[-1]:
                val = slope * i + intercept
                s[i] = np.clip(val, 0, 100)

    return s


def interpolate_by_country(df: pd.DataFrame, max_gap: int, extrap_window: int) -> pd.DataFrame:
    """
    For each country:
      - linear interpolation of internal gaps (up to max_gap in a row)
      - linear extrapolation of boundary gaps
    """
    log.info("Step 1: temporal interpolation / extrapolation per country …")

    df = df.copy()
    filled_interp  = 0
    filled_extrap  = 0

    for country, grp in df.groupby("country"):
        idx   = grp.index
        years = grp["year"].values
        hpi   = grp["hpi"].copy()

        # Reindex by year for correct interpolation
        s = pd.Series(hpi.values, index=years, dtype=float)

        # --- Internal linear interpolation ---
        # limit=max_gap: do not fill if a gap is longer than max_gap in a row
        s_interp = s.interpolate(method="linear", limit=max_gap, limit_direction="both")
        filled_interp += int((s_interp.notna() & s.isna()).sum())

        # --- Extrapolation of boundary gaps ---
        s_extrap  = _linear_extrapolate(s_interp, n_points=extrap_window)
        filled_extrap += int((s_extrap.notna() & s_interp.isna()).sum())

        # Write back
        df.loc[idx, "hpi"] = s_extrap.values

    log.info(
        "  Interpolation filled: %d | Extrapolation filled: %d",
        filled_interp, filled_extrap,
    )
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 3 – KNN imputation within the same continent
# ═══════════════════════════════════════════════════════════════════════════

def knn_impute_by_continent(df: pd.DataFrame, k: int) -> pd.DataFrame:
    """
    For remaining gaps, applies KNN imputation in wide format
    (rows = countries, columns = years) within each continent.
    """
    remaining = df["hpi"].isna().sum()
    if remaining == 0:
        log.info("Step 2: no missing values left — KNN not needed.")
        return df

    log.info("Step 2: KNN imputation (k=%d) for %d remaining missing values …", k, remaining)

    df    = df.copy()
    years = sorted(df["year"].unique())

    # Wide format: index = country_code, columns = years
    wide = df.pivot_table(index="country_code", columns="year", values="hpi", aggfunc="first")

    continents = df[["country_code", "continent"]].drop_duplicates().set_index("country_code")

    filled_knn = 0

    for continent_id, cont_grp in continents.groupby("continent"):
        codes = cont_grp.index.tolist()
        sub   = wide.loc[wide.index.isin(codes), years]

        if sub.isna().sum().sum() == 0:
            continue

        imputer    = KNNImputer(n_neighbors=min(k, len(sub) - 1))
        sub_filled = pd.DataFrame(
            imputer.fit_transform(sub),
            index=sub.index,
            columns=sub.columns,
        )
        sub_filled = sub_filled.clip(lower=0, upper=100)

        # Count filled values
        filled_knn += int((sub_filled.notna() & sub.isna()).sum().sum())

        # Write back to long format
        for code in codes:
            if code not in sub_filled.index:
                continue
            row_mask = (df["country_code"] == code) & df["hpi"].isna()
            for yr in years:
                cell_mask = row_mask & (df["year"] == yr)
                if cell_mask.any():
                    df.loc[cell_mask, "hpi"] = sub_filled.at[code, yr]

    log.info("  KNN filled: %d missing values", filled_knn)
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 4 – Mark synthetic records and final audit
# ═══════════════════════════════════════════════════════════════════════════

def mark_synthetic(original: pd.DataFrame, filled: pd.DataFrame) -> pd.DataFrame:
    """
    Adds `hpi_synthetic` (bool): True if the value was synthesized.
    """
    was_missing = original["hpi"].isna()
    filled = filled.copy()
    filled["hpi_synthetic"] = was_missing & filled["hpi"].notna()

    synthetic_count = filled["hpi_synthetic"].sum()
    still_missing   = filled["hpi"].isna().sum()

    log.info("Synthesized values: %d", synthetic_count)
    if still_missing:
        log.warning("Still missing: %d (check countries without neighbors)", still_missing)
    else:
        log.info("All missing values filled ✓")

    # Round synthesized values to 6 decimals, like the original
    filled["hpi"] = filled["hpi"].round(6)
    return filled


def save_output(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = df.to_dict(orient="records")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=4, ensure_ascii=False)
    log.info("Saved: %s (%d records)", path, len(records))


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    # 1. Load
    df_original = load_data(INPUT_PATH)
    audit_missing(df_original)

    # 2. Temporal interpolation / extrapolation
    df_step1 = interpolate_by_country(
        df_original,
        max_gap=MAX_CONSEC_GAP_INTERP,
        extrap_window=EXTRAPOLATION_WINDOW,
    )

    remaining_after_step1 = df_step1["hpi"].isna().sum()
    log.info("After step 1, missing values left: %d", remaining_after_step1)

    # 3. KNN by continent
    df_step2 = knn_impute_by_continent(df_step1, k=KNN_NEIGHBORS)

    # 4. Mark synthetic + save
    df_final = mark_synthetic(df_original, df_step2)
    save_output(df_final, OUTPUT_PATH)

    # Brief final stats
    synth = df_final[df_final["hpi_synthetic"]]
    log.info(
        "Final — synthesized values by year:\n%s",
        synth.groupby("year")["hpi_synthetic"].count().to_string(),
    )


if __name__ == "__main__":
    main()
