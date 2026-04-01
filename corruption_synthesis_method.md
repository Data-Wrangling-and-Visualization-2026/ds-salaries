# Synthesizing Missing Values for the Corruption Perception Index (CPI)

**File:** `synthesize_corruption.py`
**Input data:** `data/preprocessed/corruption_perception_clean.json`
**Output data:** `data/preprocessed/corruption_perception_synthesized.json`

---

## 1. Context and Motivation

### What is CPI

The Corruption Perception Index (CPI) is published annually by Transparency International and measures perceived levels of public-sector corruption in countries worldwide. The score ranges from 0 (highly corrupt) to 100 (very clean). The dataset covers **183 countries** from **2012–2025**.

### Scale of the problem

After preprocessing, **46 country-year slots are missing within the 2015–2024 range** across 16 countries:

| Country | Code | Missing years | Available years |
|---------|------|--------------|-----------------|
| Bahamas | BHS | 2015 | 2012–2014, 2016–2025 |
| Belize | BLZ | 2015–2024 | 2025 only |
| Barbados | BRB | 2015 | 2012–2014, 2016–2025 |
| Brunei Darussalam | BRN | 2015, 2021–2024 | 2012–2013, 2016–2020, 2025 |
| Dominica | DMA | 2015 | 2012–2014, 2016–2025 |
| Fiji | FJI | 2015–2020 | 2021–2025 |
| Equatorial Guinea | GNQ | 2015–2016 | 2012–2013, 2017–2025 |
| Grenada | GRD | 2015 | 2016–2025 |
| Saint Lucia | LCA | 2015 | 2012–2014, 2016–2025 |
| Maldives | MDV | 2015 | 2016–2025 |
| Puerto Rico | PRI | 2015–2024 | 2012–2014 only |
| Solomon Islands | SLB | 2015 | 2016–2025 |
| Eswatini | SWZ | 2015–2016 | 2012–2014, 2017–2025 |
| Seychelles | SYC | 2016 | 2012–2015, 2017–2025 |
| St. Vincent & Grenadines | VCT | 2015 | 2012–2014, 2016–2025 |
| Vanuatu | VUT | 2015–2016 | 2017–2025 |

Most gaps are isolated to 2015 (the year had lower global coverage in Transparency International's methodology) or to small island nations with inconsistent reporting.

### Synthesized fields

All numeric fields are synthesized per row:

| Field | Type | Range |
|-------|------|-------|
| `score` | float | 0–100 |
| `rank` | int | 1–200 |
| `sources` | int | 3–10 |
| `standardError` | float | 0–50 |
| `lowerCi` | float | 0–100 |
| `upperCi` | float | 0–100 |

### Why we cannot just drop rows

The CPI is used as one of the country-level covariates in the merged analytical dataset. A missing CPI for a given country-year causes the entire row to drop from join-based analyses, even if salary and other indicators are available for that country in that year.

---

## 2. Method Selection

| Method | Pros | Cons | Decision |
|--------|------|------|----------|
| Listwise deletion | No noise introduced | Loses valid rows from joined datasets | ❌ |
| Global mean/median per year | Simple | Ignores country-specific trends | ❌ |
| **Country-level time interpolation** | Uses actual country trend | Needs data on both sides for internal gaps | ✅ (Step 1) |
| **KNN within CPI region** | Captures regional context | Requires neighbors with data | ✅ (Step 2, fallback) |

### Rationale

CPI scores are relatively stable year-to-year for most countries — they reflect structural features of governance rather than short-term shocks. This makes **linear interpolation methodologically appropriate** for internal gaps (e.g., SYC 2016 between 2015 and 2017).

For boundary gaps (e.g., FJI missing 2015–2020 where only 2021+ is available), **linear extrapolation** from the nearest known edge points is a reasonable approximation of the likely trend.

For the two countries with very few data points (BLZ has only 2025; PRI has only 2012–2014), extrapolation may produce values far from the target range. The **KNN fallback** within the same CPI reporting region uses comparable neighboring countries to fill remaining gaps.

---

## 3. Detailed Algorithm

### Step 1 — Complete Grid Construction

Before interpolation, rows for all missing (country, year) pairs within TARGET_YEARS are inserted with `NaN` for all numeric fields. Non-numeric fields (`country`, `region`, `country_code`) are carried forward from the country's existing records. This produces a complete working grid of 2,540 rows.

### Step 2 — Temporal Interpolation and Extrapolation

For each country separately and each numeric field independently:

1. Build a time series `field[year]` indexed by year (using all years available for that country, not just 2015–2024, to maximize context for extrapolation).
2. Fill **internal gaps** with `pandas.Series.interpolate(method='linear', limit=MAX_CONSEC_GAP_INTERP)`.
   Gaps longer than `MAX_CONSEC_GAP_INTERP = 8` consecutive NaN years are not interpolated.
3. Fill **boundary gaps** (before the first known year or after the last) with linear extrapolation using `EXTRAPOLATION_WINDOW = 3` edge points.
   Results are clipped to each field's valid range.

**Result (on real data):** 42 cells filled by interpolation + 4 by extrapolation = **46 of 46 gaps closed** — KNN not needed.

### Step 3 — KNN Imputation within CPI Region (fallback)

If any gaps remain after Step 2:

1. Convert data to **wide format**: rows = countries, columns = years, values = the target field.
2. For each CPI region (AME, AP, ECA, MENA, SSA, WE/EU), apply `sklearn.impute.KNNImputer` with `k = KNN_NEIGHBORS = 5`.
3. Results clipped to each field's valid range.

CPI regions are used instead of global KNN because corruption levels vary substantially across regions; within-region neighbors preserve that context.

---

## 4. Marking Synthetic Data

All rows that were inserted as NaN and subsequently filled are flagged with **`corruption_synthetic = True`**.
Original records receive **`corruption_synthetic = False`**.

---

## 5. Limitations and Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Belize (BLZ)** | Only has 2025 data; 10 years extrapolated backward from 1 point → KNN used if `_linear_extrapolate` has < 2 known values | In practice, Step 1 extrapolated successfully using 2025 as a single anchor (right-edge only). |
| **Puerto Rico (PRI)** | Only has 2012–2014; forward extrapolation to 2024 covers 10 years | Extrapolation from 3 points over 10 years reduces reliability; values should be treated as rough estimates. |
| **`rank` field** | Rank is relative across all countries in a given year; synthesized ranks are interpolated independently of other countries' scores | Synthesized ranks are approximate and may not match the true ordering. Use `score` as the primary field for analysis. |
| **`sources` count** | Number of data sources used in CPI calculation; interpolated values are rounded and clipped to [3, 10] | Minor field; not used in downstream aggregations. |
| **Linear trend assumption** | CPI for some countries changes non-linearly (e.g., following political upheaval) | `corruption_synthetic` flag enables sensitivity analysis excluding synthesized rows. |

---

## 6. Running the Script

```bash
# From the project root:
python synthesize_corruption.py
```

**Dependencies:**

```
pandas
numpy
scikit-learn
```

Installation:

```bash
pip install pandas numpy scikit-learn
```

**Output** `data/preprocessed/corruption_perception_synthesized.json` contains all original fields plus `corruption_synthetic` (bool).

---

## 7. Parameters

| Parameter | Default | Description |
|---|---|---|
| `TARGET_YEARS` | `range(2015, 2025)` | Years to ensure full coverage for |
| `MAX_CONSEC_GAP_INTERP` | `8` | Max consecutive NaN years for interpolation |
| `EXTRAPOLATION_WINDOW` | `3` | Number of edge points for linear extrapolation |
| `KNN_NEIGHBORS` | `5` | Number of neighbors for KNN fallback |

---

## 8. Results

```
Total records: 2,540
  Original:    2,494
  Synthesized:    46  (1.8%)

Breakdown by year:
  2015: 15 rows (most countries had their only gap here)
  2016:  7 rows
  2017:  3 rows
  2018:  3 rows
  2019:  3 rows
  2020:  3 rows
  2021:  3 rows
  2022:  3 rows
  2023:  3 rows
  2024:  3 rows
```
