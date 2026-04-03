# Synthesizing Missing Unemployment Rate Values for 2015–2024

**File:** `synthesize_unemployment.py`
**Input data:** `data/preprocessed/unemployement_rate_clean.json`
**Output data:** `data/preprocessed/unemployement_rate_synthesized.json`

---

## 1. Context and Motivation

### What is the unemployment rate dataset

The dataset contains annual unemployment rates (%) for **56 countries**, spanning exactly **2015–2024** (10 years × 56 countries = 560 records). Unlike the inflation or CPI datasets, the temporal range is complete — every country has a row for each year. The issue is **null values within existing rows**, not missing rows.

### Scale of the problem

**36 of 560 records (6.4%) have null unemployment_rate**, split across 6 countries with two distinct types of gaps:

#### Case A — Partial nulls (country has some known values)

| Country | Code | Null years | Known years | Gap type |
|---------|------|-----------|-------------|---------|
| Kyrgyzstan | KGZ | 2024 | 2015–2023 | Right-edge (1 year) |
| Tajikistan | TJK | 2020, 2024 | 2015–2019, 2021–2023 | Internal + right-edge |
| Ukraine | UKR | 2022, 2023, 2024 | 2015–2021 | Right-edge (3 years, post-invasion) |

#### Case B — Complete nulls (all 10 years null; ILO reporting not available)

| Country | Code | Note |
|---------|------|------|
| Monaco | MCO | Microstate; not covered by ILO standard surveys |
| Russian Federation | RUS | Data withheld / not reported in this dataset |
| Turkmenistan | TKM | Authoritarian state with no independent ILO reporting |

### Why we cannot just leave nulls

The unemployment rate is a macro-economic covariate in the merged country-year dataset. Null values prevent these rows from contributing to any analysis that requires the full set of economic indicators.

---

## 2. Method Selection

Two cases require different methods:

| Case | Method | Rationale |
|------|--------|-----------|
| **Case A** (partial nulls) | Temporal interpolation / extrapolation | Country has known values on at least one side of the gap; time series structure is exploitable |
| **Case B** (all-null) | Global KNN imputation | No within-country information is available; must borrow from structurally similar countries |

---

## 3. Detailed Algorithm

### Step 1 — Temporal Interpolation and Extrapolation (Case A)

For each country that has at least one non-null value:

1. Build a time series `unemployment_rate[year]` indexed by year.
2. Fill **internal gaps** with `pandas.Series.interpolate(method='linear', limit=MAX_CONSEC_GAP_INTERP=6, limit_direction='both')`.
   - `limit_direction='both'` also handles boundary gaps up to `limit` years from the edge.
3. Apply `_linear_extrapolate(series, n_points=EXTRAPOLATION_WINDOW=3)` for any remaining boundary gaps not handled by interpolation.
4. Clip all values to `[0.0, 50.0]` (the `UNEMPLOYMENT_CLIP` range).

Countries with **all-null** values (MCO, RUS, TKM) are skipped at this step and handled by KNN.

**Result:** 6 null values filled (KGZ 2024 × 1, TJK 2020 + 2024 × 2, UKR 2022–2024 × 3).

### Step 2 — Global KNN Imputation (Case B)

For the 3 countries remaining with all-null values (MCO, RUS, TKM):

1. Reshape the dataset to **wide format**: rows = 56 countries, columns = 10 years, values = `unemployment_rate`.
   - All-null rows (MCO, RUS, TKM) are explicitly included via `reindex` — `pivot_table` silently drops all-NaN rows otherwise.
2. Apply `sklearn.impute.KNNImputer(n_neighbors=5)` globally across all 56 countries.
   - For all-NaN rows, sklearn falls back to **column means** (global mean unemployment per year) when no shared non-NaN features exist with any neighbor.
3. Clip results to `[0.0, 50.0]`.
4. Write back to the long-format DataFrame.

**Note on Case B countries:** Because MCO, RUS, and TKM have no known values, their synthesized unemployment rates are derived from the global mean unemployment per year across the 56 countries in the dataset. This is equivalent to assigning the "average country" rate, which may not reflect the true values for these specific countries:

- **Monaco (MCO):** Likely has very low unemployment (~1–3%, comparable to Luxembourg/Switzerland). The KNN/mean estimate may overstate it.
- **Russia (RUS):** Official unemployment figures ranged from ~4–5% in 2015–2021. KNN from a 56-country global pool should approximate this reasonably.
- **Turkmenistan (TKM):** Officially reported as ~11% with very low real-world labor market transparency. Any estimate is speculative.

**Result:** 30 null values filled (10 per country).

---

## 4. Marking Synthetic Data

All records that had `unemployment_rate = null` in the input and were subsequently filled are flagged with **`unemployment_synthetic = True`**.
Records that already had a non-null value receive **`unemployment_synthetic = False`**.

No new rows are added — the 560-record structure is preserved; only null values are filled.

---

## 5. Limitations and Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Ukraine 2022–2024** | Unemployment rose sharply after the 2022 invasion; linear extrapolation from 2015–2021 trend (~10%) does not capture the post-war labor market collapse | Mark as synthetic; exclude from Ukraine-specific trend analyses covering 2022+ |
| **MCO, RUS, TKM imputation** | No within-country data exists; KNN falls back to global column means | These values are low-confidence approximations; treat as order-of-magnitude estimates only |
| **Turkmenistan (TKM)** | Official statistics are considered unreliable even when published; the synthesized values are doubly uncertain | `unemployment_synthetic = True` for all TKM rows |
| **Global KNN pool** | The 56-country dataset has a specific geographic composition; countries in the pool may not be the most similar neighbors for Monaco or Turkmenistan | Small dataset means limited neighbor options; a larger country universe would improve KNN quality |

---

## 6. Running the Script

```bash
# From the project root:
python synthesize_unemployment.py
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

**Output** `data/preprocessed/unemployement_rate_synthesized.json` contains all 560 records with filled unemployment rates and an added `unemployment_synthetic` (bool) column. Precision is rounded to 1 decimal place to match the original dataset.

---

## 7. Parameters

| Parameter | Default | Description |
|---|---|---|
| `KNN_NEIGHBORS` | `5` | Number of neighbors for global KNN |
| `MAX_CONSEC_GAP_INTERP` | `6` | Max consecutive NaN for interpolation |
| `EXTRAPOLATION_WINDOW` | `3` | Edge points for linear extrapolation |
| `UNEMPLOYMENT_CLIP` | `(0.0, 50.0)` | Valid range for unemployment rate (%) |

---

## 8. Results

```
Total records: 560  (unchanged — null values filled, no rows added)
  Originally null: 36  (6.4%)
  Synthesized:     36  (all nulls filled)

Breakdown by country:
  KGZ  1 value  (extrapolation)
  MCO  10 values (KNN / global mean)
  RUS  10 values (KNN / global mean)
  TJK  2 values  (interpolation + extrapolation)
  TKM  10 values (KNN / global mean)
  UKR  3 values  (extrapolation)
```
