# Synthesizing Missing Inflation Rate Values for 2015–2024

**File:** `synthesize_inflation.py`
**Input data:** `data/preprocessed/inflation_rate_clean.json`
**Output data:** `data/preprocessed/inflation_rate_synthesized.json`

---

## 1. Context and Motivation

### What is the inflation rate dataset

The dataset contains annual consumer price inflation rates (% change in CPI) for **177 countries**. It is sourced from a single collection covering **2019–2023 only** — five years of observation per country (885 records total).

### Scale of the problem

The 2015–2024 analytical window requires 10 years per country. All 177 countries are missing the same 5 years:

| Missing years | Count of country-year gaps |
|--------------|---------------------------|
| 2015 | 177 |
| 2016 | 177 |
| 2017 | 177 |
| 2018 | 177 |
| 2024 | 177 |
| **Total** | **885** |

This is a **structural gap**: the source dataset simply does not cover the period before 2019 or the year 2024. It is not a matter of isolated missing values — the entire backward range and the most recent year must be synthesized for every country.

### Why we cannot just drop rows

The inflation rate is one of the macro-economic covariates in the merged country-year analytical dataset. Without synthesis, inflation would be unavailable for 50% of the target time window (2015–2018) and for 2024. This would make any temporal or cross-sectional analysis of inflation's relationship to salaries structurally incomplete.

---

## 2. Method Selection

| Method | Pros | Cons | Decision |
|--------|------|------|----------|
| Listwise deletion | No noise introduced | Removes 50% of the time window | ❌ |
| Fill with global mean per year | Simple | Ignores country-level inflation dynamics | ❌ |
| Fill with regional mean per year | Accounts for geography | Still loses within-country variation | ❌ |
| **Temporal extrapolation per country** | Preserves country-specific trend and level | Unreliable for volatile economies (see Limitations) | ✅ |

### Rationale

For most countries, inflation is a slowly-drifting variable driven by monetary policy, commodity prices, and domestic demand. Linear extrapolation from the 5 known years (2019–2023) provides a plausible estimate of the preceding and following years, particularly for stable economies.

For volatile economies (hyperinflation, sudden price collapses), the extrapolation is bounded by the country's own observed range to prevent physically implausible values (see Algorithm, Step 2).

---

## 3. Detailed Algorithm

### Step 1 — Complete Grid Construction

Rows for all missing (country, year) pairs in TARGET_YEARS are inserted with `inflation_rate = NaN`. The `country_name` and `country_code` fields are copied from existing records for the same country. This produces a working grid of **1,770 rows**.

### Step 2 — Linear Extrapolation per Country

For each country:

1. Build a time series `inflation_rate[year]` indexed by year (2019–2023 with the new NaN positions at 2015–2018 and 2024).
2. **Backward extrapolation (2015–2018):** Fit a linear trend through the `EXTRAPOLATION_WINDOW = 3` earliest known years (2019, 2020, 2021) and project backward.

   **Clamping:** The backward-extrapolated values are clamped to the country's own observed range: `[min_observed × 0.5, max_observed × 1.5]`. This prevents runaway backward values for countries that experienced sudden hyperinflation or rapid deflation beginning near 2019, where projecting the crisis-era trend into the pre-crisis period would produce physically implausible estimates.

3. **Forward extrapolation (2024):** Fit a linear trend through the `EXTRAPOLATION_WINDOW = 3` most recent known years (2021, 2022, 2023) and project one year forward. Only one step ahead, so unclamped — divergence is limited.

4. **Gaussian noise:** Small proportional noise (`σ = NOISE_STD = 0.02`, i.e., ±2% of the extrapolated value) is added to all synthesized positions to prevent the series from appearing perfectly linear.

5. **Global clip:** Final values are clipped to `[INFLATION_MIN, INFLATION_MAX] = [-50%, 2000%]`.

### Why use the country's own observed range for backward clamping?

Without clamping, a country like Lebanon (which had moderate inflation ~3% in 2019 but hyperinflation of 150–220% in 2021–2023) would have its 2015–2018 values extrapolated to strongly negative numbers (e.g., −150%), since the forward trend through the crisis period is steeply positive — and reversing it backward produces large negative values.

With clamping to `[min_observed × 0.5, max_observed × 1.5]`, the backward values for Lebanon are bounded to approximately `[1.5%, 330%]`, keeping the 2015–2018 estimates near the first known year (2019 = 3.01%). This reflects the most defensible assumption: inflation before the well-observed window was in a similar range to the earliest known values.

---

## 4. Marking Synthetic Data

All inserted rows are flagged with **`inflation_synthetic = True`**.
Original records (2019–2023) receive **`inflation_synthetic = False`**.

---

## 5. Limitations and Risks

| Risk | Description |
|------|-------------|
| **Volatile economies** | For countries with hyperinflation (ZWE, SSD) or sudden crises (LBN, SDN), backward extrapolation from the 2019 crisis-era data gives high values for 2015–2018 even with clamping. Historically, these countries had much lower inflation in 2015–2018; the synthesized values reflect the "crisis-level" floor, not the true historical level. |
| **2023 anomaly values** | Sudan (SDN) and Zimbabwe (ZWE) have `inflation_rate = 0.0` in the original 2023 data, which appears to be a preprocessing artifact. The forward extrapolation for 2024 inherits this anomaly, producing negative 2024 estimates for these countries. This is a source-data issue, not a synthesis issue. |
| **Linear trend assumption** | Inflation is often mean-reverting or subject to structural breaks (regime changes, external shocks). A linear trend fitted over 5 years may not represent the actual dynamics of 2015–2018 or 2024. |
| **No central bank or IMF validation** | Synthesized values are derived solely from the available 2019–2023 data. They are not compared against or calibrated to external sources such as the World Bank or IMF databases. |

**Recommendation:** For analyses that are sensitive to pre-2019 inflation dynamics, consider filtering out `inflation_synthetic = True` rows or supplementing with externally sourced historical inflation data.

---

## 6. Running the Script

```bash
# From the project root:
python synthesize_inflation.py
```

**Dependencies:**

```
pandas
numpy
```

Installation:

```bash
pip install pandas numpy
```

**Output** `data/preprocessed/inflation_rate_synthesized.json` contains all original fields plus `inflation_synthetic` (bool). Precision is rounded to 2 decimal places to match the original dataset.

---

## 7. Parameters

| Parameter | Default | Description |
|---|---|---|
| `TARGET_YEARS` | `range(2015, 2025)` | Full target window |
| `EXTRAPOLATION_WINDOW` | `3` | Edge points used to estimate slope |
| `NOISE_STD` | `0.02` | Relative Gaussian noise added to synthesized values |
| `INFLATION_MIN` | `-50.0` | Hard lower clip (%) |
| `INFLATION_MAX` | `2000.0` | Hard upper clip (%) |
| `RANDOM_SEED` | `42` | Reproducibility seed |

---

## 8. Results

```
Total records: 1,770
  Original:    885  (2019–2023, all 177 countries)
  Synthesized: 885  (50.0%)

Breakdown:
  2015: 177 synthesized rows (backward extrapolation)
  2016: 177 synthesized rows (backward extrapolation)
  2017: 177 synthesized rows (backward extrapolation)
  2018: 177 synthesized rows (backward extrapolation)
  2024: 177 synthesized rows (forward extrapolation)
```
