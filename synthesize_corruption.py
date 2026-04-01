"""
synthesize_corruption.py
────────────────────────
Synthesizes missing Corruption Perception Index (CPI) values for 2015–2024.

Coverage: 183 countries, years 2012–2025.
Target  : fill all 46 missing country-year slots within 2015–2024.

Strategy (mirrors synthesize_happiness_index.py):
  1. Build a complete country × year grid by inserting NaN rows for all
     missing TARGET_YEARS entries.
  2. For each country, apply linear interpolation (internal gaps) and
     linear extrapolation (boundary gaps) to every numeric field.
  3. KNN imputation within the same CPI region for any gaps that remain.

All synthesized rows are flagged with `corruption_synthetic = True`.
Original records receive `corruption_synthetic = False`.

Input : data/preprocessed/corruption_perception_clean.json
Output: data/preprocessed/corruption_perception_synthesized.json
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
INPUT_PATH  = ROOT / "data/preprocessed/corruption_perception_clean.json"
OUTPUT_PATH = ROOT / "data/preprocessed/corruption_perception_synthesized.json"

# ── Parameters ────────────────────────────────────────────────────────────────
TARGET_YEARS          = list(range(2015, 2025))
KNN_NEIGHBORS         = 5
MAX_CONSEC_GAP_INTERP = 8   # max consecutive NaNs allowed for interpolation
EXTRAPOLATION_WINDOW  = 3   # number of known edge points for linear extrapolation

# Numeric fields and their valid [min, max] clip bounds
NUMERIC_FIELDS: dict[str, tuple[float, float]] = {
    "score":         (0.0,   100.0),
    "rank":          (1.0,   200.0),
    "sources":       (3.0,    10.0),
    "standardError": (0.0,    50.0),
    "lowerCi":       (0.0,   100.0),
    "upperCi":       (0.0,   100.0),
}

# Fields that must be whole numbers after synthesis
INT_FIELDS = {"rank", "sources"}


# ═══════════════════════════════════════════════════════════════════════════
# Step 1 – Load and audit
# ═══════════════════════════════════════════════════════════════════════════

def load_data(path: Path) -> pd.DataFrame:
    log.info("Loading data: %s", path)
    with open(path) as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    df = df.sort_values(["country_code", "year"]).reset_index(drop=True)

    total   = len(df)
    log.info("Records loaded: %d | Countries: %d | Years: %s",
             total, df["country_code"].nunique(), sorted(df["year"].unique()))
    return df


def audit_missing(df: pd.DataFrame) -> None:
    by_country = df.groupby("country_code")["year"].apply(set)
    gaps = [
        (code, sorted(set(TARGET_YEARS) - years))
        for code, years in by_country.items()
        if set(TARGET_YEARS) - years
    ]
    total_gaps = sum(len(g) for _, g in gaps)
    log.info("Missing country-year slots in %s: %d", TARGET_YEARS, total_gaps)
    for code, yrs in sorted(gaps):
        country = df.loc[df["country_code"] == code, "country"].iloc[0]
        log.info("  %s (%s): %s", code, country, yrs)


# ═══════════════════════════════════════════════════════════════════════════
# Step 2 – Build complete grid
# ═══════════════════════════════════════════════════════════════════════════

def create_full_grid(df: pd.DataFrame) -> tuple[pd.DataFrame, set]:
    """
    Inserts NaN rows for every (country, year) in TARGET_YEARS that is absent
    from the original data.  Returns the expanded DataFrame and the set of
    (country_code, year) pairs that were added.
    """
    country_meta = (
        df[["country_code", "country", "region"]]
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
                    "country_code":  code,
                    "country":       meta["country"],
                    "region":        meta["region"],
                    "year":          year,
                    **{f: np.nan for f in NUMERIC_FIELDS},
                    "country_year":  f"{code}{year}",
                })
                added_keys.add((code, year))

    if new_rows:
        df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)

    df = df.sort_values(["country_code", "year"]).reset_index(drop=True)
    log.info("Grid expanded: +%d NaN rows added", len(added_keys))
    return df, added_keys


# ═══════════════════════════════════════════════════════════════════════════
# Step 3 – Temporal interpolation / extrapolation per country
# ═══════════════════════════════════════════════════════════════════════════

def _linear_extrapolate(series: pd.Series, n_points: int) -> pd.Series:
    """
    Fills NaNs at both edges of a year-indexed Series via linear extrapolation.
    Uses `n_points` known values from each edge for the slope estimate.
    Results are NOT clipped here — caller applies field-specific bounds.
    """
    s = series.copy()
    known_idx = s.dropna().index.tolist()
    if len(known_idx) < 2:
        return s

    # Left edge: extrapolate backward from the first known values
    left_known = known_idx[:n_points]
    if len(left_known) >= 2:
        left_x  = np.array(left_known, dtype=float)
        left_y  = s[left_known].values
        slope, intercept = np.polyfit(left_x, left_y, 1)
        for i in s.index:
            if pd.isna(s[i]) and i < known_idx[0]:
                s[i] = slope * float(i) + intercept

    # Right edge: extrapolate forward from the last known values
    right_known = known_idx[-n_points:]
    if len(right_known) >= 2:
        right_x = np.array(right_known, dtype=float)
        right_y = s[right_known].values
        slope, intercept = np.polyfit(right_x, right_y, 1)
        for i in s.index:
            if pd.isna(s[i]) and i > known_idx[-1]:
                s[i] = slope * float(i) + intercept

    return s


def interpolate_by_country(df: pd.DataFrame) -> pd.DataFrame:
    """
    For each country, applies per-field interpolation then extrapolation.
    """
    log.info("Step 1: temporal interpolation / extrapolation per country …")
    df = df.copy()

    filled_interp  = {f: 0 for f in NUMERIC_FIELDS}
    filled_extrap  = {f: 0 for f in NUMERIC_FIELDS}

    for country_code, grp in df.groupby("country_code"):
        idx   = grp.index
        years = grp["year"].values

        for field, (lo, hi) in NUMERIC_FIELDS.items():
            s = pd.Series(grp[field].values.astype(float), index=years)

            # Internal interpolation
            s_interp = s.interpolate(
                method="linear", limit=MAX_CONSEC_GAP_INTERP, limit_direction="both"
            )
            filled_interp[field] += int((s_interp.notna() & s.isna()).sum())

            # Boundary extrapolation
            s_extrap = _linear_extrapolate(s_interp, n_points=EXTRAPOLATION_WINDOW)
            filled_extrap[field] += int((s_extrap.notna() & s_interp.isna()).sum())

            # Clip to valid range
            s_extrap = s_extrap.clip(lower=lo, upper=hi)

            df.loc[idx, field] = s_extrap.values

    for field in NUMERIC_FIELDS:
        log.info(
            "  [%s] interpolated: %d | extrapolated: %d",
            field, filled_interp[field], filled_extrap[field],
        )
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 4 – KNN imputation within the same CPI region (fallback)
# ═══════════════════════════════════════════════════════════════════════════

def knn_impute_by_region(df: pd.DataFrame) -> pd.DataFrame:
    """
    For any remaining NaN values, applies KNNImputer (k=KNN_NEIGHBORS)
    in wide format (rows = countries, columns = years) within each CPI region.
    Applied independently to each numeric field.
    """
    remaining = {f: int(df[f].isna().sum()) for f in NUMERIC_FIELDS}
    total_remaining = sum(remaining.values())

    if total_remaining == 0:
        log.info("Step 2: no missing values left — KNN not needed.")
        return df

    log.info("Step 2: KNN imputation (k=%d) for %d remaining cell(s) …",
             KNN_NEIGHBORS, total_remaining)

    df     = df.copy()
    years  = sorted(df["year"].unique())
    regions = df[["country_code", "region"]].drop_duplicates().set_index("country_code")

    filled_knn = 0

    for field, (lo, hi) in NUMERIC_FIELDS.items():
        if df[field].isna().sum() == 0:
            continue

        wide = df.pivot_table(
            index="country_code", columns="year", values=field, aggfunc="first"
        )

        for region_id, reg_grp in regions.groupby("region"):
            codes = reg_grp.index.tolist()
            sub   = wide.loc[wide.index.isin(codes), years]

            if sub.isna().sum().sum() == 0:
                continue

            k = min(KNN_NEIGHBORS, max(1, len(sub) - 1))
            imputer   = KNNImputer(n_neighbors=k)
            sub_filled = pd.DataFrame(
                imputer.fit_transform(sub),
                index=sub.index,
                columns=sub.columns,
            ).clip(lower=lo, upper=hi)

            for code in codes:
                if code not in sub_filled.index:
                    continue
                mask = (df["country_code"] == code) & df[field].isna()
                for yr in years:
                    cell_mask = mask & (df["year"] == yr)
                    if cell_mask.any():
                        df.loc[cell_mask, field] = sub_filled.at[code, yr]
                        filled_knn += 1

    log.info("  KNN filled: %d cell(s)", filled_knn)
    return df


# ═══════════════════════════════════════════════════════════════════════════
# Step 5 – Apply integer rounding, mark synthetic, save
# ═══════════════════════════════════════════════════════════════════════════

def finalize(
    df_original: pd.DataFrame,
    df_filled: pd.DataFrame,
    added_keys: set,
) -> pd.DataFrame:
    """
    - Rounds integer fields.
    - Marks synthesized rows with `corruption_synthetic = True`.
    - Marks original rows with `corruption_synthetic = False`.
    """
    df = df_filled.copy()

    for field in INT_FIELDS:
        df[field] = df[field].round().astype("Int64")

    synthetic_mask = df.apply(
        lambda row: (row["country_code"], row["year"]) in added_keys, axis=1
    )
    df["corruption_synthetic"] = synthetic_mask

    synth_count = int(df["corruption_synthetic"].sum())
    still_null  = int(df[list(NUMERIC_FIELDS)].isna().any(axis=1).sum())

    log.info("Synthesized rows: %d", synth_count)
    if still_null:
        log.warning("Rows still containing NaN: %d", still_null)
    else:
        log.info("All missing values filled ✓")

    return df


def save_output(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    # Convert Int64 (nullable) to plain int/float for JSON serialisation
    records = []
    for rec in df.to_dict(orient="records"):
        clean = {}
        for k, v in rec.items():
            if hasattr(v, "item"):          # numpy scalar → Python native
                v = v.item()
            if v != v:                      # NaN → None
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

    # 2. Build complete grid (adds NaN rows for missing TARGET_YEARS slots)
    df_grid, added_keys = create_full_grid(df_original)

    # 3. Temporal interpolation / extrapolation
    df_step1 = interpolate_by_country(df_grid)

    remaining = int(df_step1[list(NUMERIC_FIELDS)].isna().any(axis=1).sum())
    log.info("After step 1, rows with any NaN: %d", remaining)

    # 4. KNN fallback within region
    df_step2 = knn_impute_by_region(df_step1)

    # 5. Round integers, mark synthetic, save
    df_final = finalize(df_original, df_step2, added_keys)
    save_output(df_final, OUTPUT_PATH)

    # Summary by year
    synth = df_final[df_final["corruption_synthetic"]]
    if not synth.empty:
        log.info(
            "Synthesized rows by year:\n%s",
            synth.groupby("year")["corruption_synthetic"].count().to_string(),
        )


if __name__ == "__main__":
    main()
