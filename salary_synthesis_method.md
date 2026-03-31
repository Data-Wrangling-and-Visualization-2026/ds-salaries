# Salary Data Synthesis Method

**Script:** `synthesize_salaries_2019.py`
**Input:** `data/preprocessed/DataScience_salaries_2025_clean.json`
**Output:** `data/preprocessed/DataScience_salaries_2025_clean_synthesized.json`

---

## Problem Statement

The original dataset covers 2020–2025. The year **2019 is entirely absent**, even though the data science labor market existed and the gap distorts time-series analyses that require pre-2020 baselines.

Additionally, **32 within-range country-year gaps** exist (e.g., Country X has records in 2021 and 2023 but not 2022). These gaps appear for 23 countries and, if left unfilled, produce discontinuities when tracking per-country salary trends over time.

| Issue | Magnitude |
|---|---|
| 2019 — year completely missing | 0 records → 65 synthesized |
| Within-range gaps (2020–2025) | 32 country-year slots → 158 records synthesized |
| **Total synthesized** | **223 records (0.24% of output)** |

All synthesized records are flagged with `salary_synthetic = True` so they can be excluded from or compared against real-data analyses.

---

## Why Synthesis Is Needed

Dropping 2019 entirely forces any trend analysis to start from 2020, a year distorted by the onset of COVID-19. The pandemic reshaped remote work adoption, labor demand, and salary growth in ways that make 2020 a poor baseline. Synthesizing 2019 provides a plausible pre-COVID anchor point.

Country-year gaps similarly distort per-country time series. Without filling them, a salary trend line for a country like ARE (UAE) jumps directly from 2020 to 2022, overstating year-over-year growth and masking data-collection inconsistency.

---

## Algorithm

### Step 1 — 2019 Synthesis (Backward Extrapolation)

**Goal:** Create ~65 plausible records for 2019 (proportional to 2020's 75 records).

**Salary distribution:**
- Reference median: 2020 median salary in USD (~$79,833).
- Applied a **7% deflation** to estimate the 2019 baseline (~$74,200 target median).
  The 7% rate was chosen by comparing the observed 2020→2021 trajectory (+5%) and
  the broader context that 2020–2021 were already elevated by COVID-era tech demand.
- Salaries are drawn from a **log-normal distribution** with:
  - `μ = log(median_2019)` — shifts the distribution to the 2019 level.
  - `σ` — standard deviation of log-salaries observed in 2020–2021 (preserves spread).
- Clipped to the range [$15,000; $400,000].

**Categorical fields** (experience_level, employment_type, company_size, company_location, job_title):
- Sampled **with replacement** from the 2020–2021 joint distribution using observed frequencies as probabilities.

**Pre-COVID adjustments:**
- **Remote ratio** set to **12%** (vs 48% in 2020), reflecting pre-pandemic norms when on-site work was standard.
- **Job title filter:** Titles associated with the post-2022 AI/LLM era (e.g., "AI Engineer", "MLOps Engineer", "LLM Engineer") are excluded from the sampling pool. Only titles plausibly in use in 2019 are sampled.

**Currency:** Derived from `company_location` via a country→dominant-currency lookup table (e.g., USA→USD, GBR→GBP). Defaults to USD for unmapped countries.

---

### Step 2 — Within-Range Gap Filling (2020–2025)

**Goal:** For each country active in year Y_min through Y_max, fill any missing year within that span.

**Algorithm (per missing country-year):**

1. **Identify neighboring years** — the nearest available year below and above the gap year.
2. **Estimate salary level** — interpolate the country's per-year median salary using `np.interp` between known years. Compute a `salary_scale` factor: `interpolated_median / neighbor_median`.
3. **Sample N records** — draw N records from the neighboring years' pool (with replacement), where N = average record count across the neighboring years.
4. **Adjust salaries** — multiply sampled `salary_in_usd` by `salary_scale`, then add ±5% Gaussian noise to prevent exact clones.
5. **Update metadata** — set `work_year`, `country_year`, and `salary_synthetic = True`.

This is analogous to the temporal interpolation used for the Happy Planet Index (`synthesize_happiness_index.py`), adapted for individual salary records rather than aggregate metrics.

---

## Parameters

| Parameter | Value | Description |
|---|---|---|
| `RANDOM_SEED` | 42 | Reproducibility seed for numpy RNG |
| `TARGET_2019_RECORDS` | 65 | Target record count for 2019 |
| `SALARY_DEFLATION_RATE` | 0.07 | 7% salary reduction 2019 vs 2020 |
| `REMOTE_RATIO_2019` | 0.12 | Pre-COVID remote work fraction |
| `JOB_TITLES_2019_WHITELIST` | 22 titles | Titles plausible in 2019 |

---

## Results

```
Total records: 93,820
  Original:    93,597  (99.76%)
  Synthesized:    223   (0.24%)

Breakdown:
  2019: 65 synthetic records   (year fully absent → generated from scratch)
  2021: 11 synthetic records   (11 country-year gaps filled)
  2022: 30 synthetic records   (10 country-year gaps filled)
  2023: 109 synthetic records  (16 country-year gaps filled)
  2024: 8 synthetic records    (4 country-year gaps filled)
```

**Countries with filled gaps:** ARE, ASM, AUT, BEL, CHL, DNK, DZA, EGY, HND, HRV, HUN, IDN, LUX, MEX, MLT, MYS, NOR, NZL, PAK, PHL, PRI, SVN, THA.

---

## Limitations

- **2019 salaries are estimated, not observed.** The deflation rate (7%) is an assumption based on pre-COVID wage growth trends; actual 2019 DS salaries may have been higher or lower.
- **2019 country distribution** mirrors 2020–2021 and is dominated by USA (~50%), EU, and UK. Countries that entered the survey only after 2021 (e.g., many African and Southeast Asian markets) are absent from 2019, which likely underestimates geographic diversification.
- **Remote flag in 2019** is generated from a fixed prior (12%). Actual early-remote adoption varied significantly by company and country.
- **Gap-filled records inherit categorical fields** from neighboring years and may not perfectly reflect the conditions of the gap year (e.g., company size classification could have changed).
- **Salary noise (±5%)** prevents cloning but does not model true within-year variation for sparse countries (some country-year slots have only 1–2 records).
- All synthesized records should be **excluded or sensitivity-tested** in statistical analyses where data provenance matters.

---

## Reproducibility

Run from the project root with:

```bash
/opt/anaconda3/bin/python synthesize_salaries_2019.py
```

The script is deterministic given `RANDOM_SEED = 42`. Changing any parameter (deflation rate, remote ratio, target record count) will alter the synthesized values but not the gap-detection or interpolation logic.
