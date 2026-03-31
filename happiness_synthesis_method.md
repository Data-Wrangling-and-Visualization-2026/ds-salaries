# Synthesizing Missing Values for the Happy Planet Index (HPI)

**File:** `synthesize_happiness_index.py`  
**Input data:** `data/preprocessed/hpi_clean.json`  
**Output data:** `data/preprocessed/hpi_synthesized.json`

---

## 1. Context and Motivation

### What is HPI

Happy Planet Index (HPI) is a composite index developed by the New Economics Foundation to measure population well‑being while accounting for ecological footprint. The index ranges from 0 to 100 and is calculated as:

```
HPI = (Wellbeing × Life Expectancy × Equality) / Ecological Footprint
```

The data covers **149 countries** from **2006–2021** (16 time points, total 2,384 records).

### Scale of the problem

After primary preprocessing (`hpi_preprocessing.ipynb`), the dataset still has **257 missing HPI values (10.8%)** with the following distribution:

| Year | Missing | Comment |
|------|---------|---------|
| 2006 | 62      | Series start — many countries were not yet included |
| 2007 | 32      | Gradual expansion of coverage |
| 2008 | 32      | — |
| 2009 | 27      | — |
| 2010 | 23      | — |
| 2011–2019 | 5–11 | Isolated missing values |
| 2020–2021 | 2    | Near‑complete coverage |

The largest number of gaps is concentrated in **early years** (2006–2010) and in **countries with unstable statistical systems** (Bhutan, Burundi, Sudan, Central African Republic, etc.).

### Why we cannot just drop rows

The dataset is merged with the Data Science salaries table (`DataScience_salaries_2025_clean.json`). If a country lacks HPI for a given year, the corresponding salary records drop out of analysis — even if specialists from that country worked in that period. This creates systematic selection bias: countries that are “data‑rich” become over‑represented.

---

## 2. Method Selection

### Alternatives considered

| Method | Pros | Cons | Decision |
|--------|------|------|----------|
| Listwise deletion | No noise introduced | Selection bias; lose up to 11% of data | ❌ |
| Fill with global mean/median | Simple | Ignores country trends and regional specificity | ❌ |
| Fill with yearly mean | Accounts for year | Ignores country specificity | ❌ |
| **Country‑level time interpolation** | Uses the actual country trend | Doesn’t handle boundary gaps without constraints | ✅ (Step 1) |
| **KNN within continent** | Accounts for regional similarity | Requires neighbors with data | ✅ (Step 2, fallback) |
| MICE (multiple imputation) | Statistically optimal | Harder to interpret; overkill for a time series | Reserve |

### Rationale for the chosen approach

HPI is a **time series**: a country’s index changes smoothly year to year because it depends on long‑term factors (life expectancy, well‑being, ecological footprint). That means **time interpolation is methodologically appropriate** for filling gaps inside the series.

For **boundary gaps** (beginning or end of the series), interpolation is not applicable because there are no data points on both sides. In this case, we apply **linear extrapolation** based on the last known points, which is reasonable when a stable trend exists.

For countries where gaps cannot be closed by interpolation or extrapolation (too long breaks), we use a **KNN fallback**: the country is compared to neighbors within the same continent in the “HPI by year” feature space, and the missing value is filled by a weighted average of nearest neighbors.

---

## 3. Detailed Algorithm

### Step 1 — Time Interpolation and Extrapolation

**For each country** separately:

1. Build a time series `HPI[year]` for 2006–2021.
2. Fill internal gaps with **linear interpolation** (`pandas.Series.interpolate(method='linear')`).  
   Constraint: if a gap is longer than **6 consecutive NaN** (`MAX_CONSEC_GAP_INTERP = 6`), it is left unfilled — too large for reliable interpolation.
3. Fill boundary gaps (before the first and after the last known value) with **linear extrapolation** using the 3 edge points (`EXTRAPOLATION_WINDOW = 3`).  
   The result is clipped to the [0, 100] range.

**Why linear interpolation and not splines?**  
HPI does not show strong nonlinear dynamics over short periods (1–3 years). More complex methods (cubic splines, polynomials) can create artifacts with few points. The linear method is transparent and robust.

**Result (on real data):** interpolation closed **254 of 257** gaps; extrapolation closed **3** more.

### Step 2 — KNN Imputation by Continent (fallback)

If gaps remain after Step 1:

1. Convert data to **wide format**: rows = countries, columns = years.
2. For each continent, apply `sklearn.impute.KNNImputer` with `k = 5`.
3. Neighbors are determined by Euclidean distance in the space of available HPI values.
4. Results are clipped to [0, 100].

**Why within continent rather than global?**  
HPI structure varies strongly across regions: Latin America is consistently high, Africa is low. Global KNN would pull values toward the overall mean. Limiting neighbors to the same continent preserves regional context.

---

## 4. Marking Synthetic Data

All synthesized values are flagged with a boolean column **`hpi_synthetic = True`**. This allows:

- optionally excluding synthetic values from specific analyses;
- sensitivity analysis with/without synthesized values;
- keeping the pipeline transparent.

---

## 5. Limitations and Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Trend linearity** | The real trend may be nonlinear (crisis, war) | `MAX_CONSEC_GAP_INTERP` constraint; `hpi_synthetic` for sensitivity checks |
| **Boundary gaps in 2006** | 62 countries lack data for 2006 — the earliest year | Extrapolation using 2007–2009; values may be less accurate |
| **Countries with critically few observations** | Bhutan has only 4 known values out of 16 | KNN within continent; `hpi_synthetic` |
| **Model optimism** | Synthesis smooths sharp changes | For downstream tasks, test with and without synthesis |

---

## 6. Running the Script

```bash
# From the project root:
python synthesize_happiness_index.py
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

**Output file** `data/preprocessed/hpi_synthesized.json` contains the same fields as the input dataset plus the boolean `hpi_synthetic` column.

---

## 7. Parameters (can be changed at the top of the script)

| Parameter | Default | Description |
|---|---|---|
| `MAX_CONSEC_GAP_INTERP` | `6` | Max gap length for interpolation |
| `EXTRAPOLATION_WINDOW` | `3` | Number of points for linear extrapolation |
| `KNN_NEIGHBORS` | `5` | Number of neighbors for KNN |
