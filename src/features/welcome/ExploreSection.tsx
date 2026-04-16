import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAvailableYears, getCountryYearMetrics } from "../../api/client";
import ScatterPlot, { ScatterDatum } from "../../components/ScatterPlot";
import { CountryMetricYear } from "../../types/metrics";
import { formatCurrency, formatPercent, formatScore } from "../../utils/format";

const pearsonR = (pairs: { x: number; y: number }[]): number => {
  if (pairs.length < 2) return 0;
  const mx = pairs.reduce((s, p) => s + p.x, 0) / pairs.length;
  const my = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
  const num = pairs.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = Math.sqrt(
    pairs.reduce((s, p) => s + (p.x - mx) ** 2, 0) *
      pairs.reduce((s, p) => s + (p.y - my) ** 2, 0)
  );
  return den === 0 ? 0 : num / den;
};

const rStrength = (r: number): string => {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "strong";
  if (abs >= 0.4) return "moderate";
  return "weak";
};

const rDirection = (r: number): string => (r >= 0 ? "positive" : "negative");

const interpretCorrelation = (r: number, xLabel: string, yLabel: string): string => {
  const strength = rStrength(r);
  const direction = rDirection(r);
  if (Math.abs(r) < 0.1) {
    return `No meaningful relationship found between ${xLabel} and ${yLabel} (r = ${r.toFixed(2)}).`;
  }
  return `There is a ${strength} ${direction} correlation between ${xLabel} and ${yLabel} (r = ${r.toFixed(2)}). Countries with higher ${xLabel.toLowerCase()} tend to have ${r > 0 ? "higher" : "lower"} ${yLabel.toLowerCase()}.`;
};

const ExploreSection = () => {
  const navigate = useNavigate();
  const [year, setYear] = useState(2024);
  const [years, setYears] = useState<number[]>([]);
  const [data, setData] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAvailableYears().then((available) => {
      setYears(available);
      if (available.length > 0) setYear(available[available.length - 1]);
    });
  }, []);

  useEffect(() => {
    if (!year) return;
    let active = true;
    setLoading(true);
    getCountryYearMetrics(year)
      .then((rows) => {
        if (!active) return;
        setData(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => { active = false; };
  }, [year]);

  const salaryVsHappiness = useMemo<ScatterDatum[]>(
    () =>
      data
        .filter((d) => d.salary > 0 && d.happiness != null && Number.isFinite(d.happiness))
        .map((d) => ({ x: d.salary, y: d.happiness!, label: d.country, iso3: d.iso3 })),
    [data]
  );

  const salaryVsUnemployment = useMemo<ScatterDatum[]>(
    () =>
      data
        .filter((d) => d.salary > 0 && d.unemployment != null && Number.isFinite(d.unemployment))
        .map((d) => ({ x: d.salary, y: d.unemployment!, label: d.country, iso3: d.iso3 })),
    [data]
  );

  const salaryVsCorruption = useMemo<ScatterDatum[]>(
    () =>
      data
        .filter((d) => d.salary > 0 && d.corruption != null && Number.isFinite(d.corruption))
        .map((d) => ({ x: d.salary, y: d.corruption!, label: d.country, iso3: d.iso3 })),
    [data]
  );

  const happinessVsInflation = useMemo<ScatterDatum[]>(
    () =>
      data
        .filter(
          (d) =>
            d.happiness != null && Number.isFinite(d.happiness) &&
            d.inflation != null && Number.isFinite(d.inflation)
        )
        .map((d) => ({ x: d.happiness!, y: d.inflation!, label: d.country, iso3: d.iso3 })),
    [data]
  );

  const rSalaryHappiness = useMemo(() => pearsonR(salaryVsHappiness), [salaryVsHappiness]);
  const rSalaryUnemployment = useMemo(() => pearsonR(salaryVsUnemployment), [salaryVsUnemployment]);
  const rSalaryCorruption = useMemo(() => pearsonR(salaryVsCorruption), [salaryVsCorruption]);
  const rHappinessInflation = useMemo(() => pearsonR(happinessVsInflation), [happinessVsInflation]);

  const handleSelect = (iso3: string) => navigate(`/country/${iso3}`);

  return (
    <section className="explore-inline-section">
      <div className="section-header">
        <h2>Global Patterns &amp; Correlations</h2>
        <p>Do higher DS salaries come with better well-being? Explore cross-country relationships.</p>
      </div>

      <div className="explore-year-row">
        <label>Year</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading && <div className="loading">Loading data…</div>}

      {!loading && data.length > 0 && (
        <>
          <div className="panel insight-panel" style={{ marginBottom: 20 }}>
            <h3>Key findings for {year}</h3>
            <ul className="insight-list">
              <li>
                <strong>Salary &amp; Happiness:</strong>{" "}
                {interpretCorrelation(rSalaryHappiness, "Median DS Salary", "Happiness Index")}
              </li>
              <li>
                <strong>Salary &amp; Unemployment:</strong>{" "}
                {interpretCorrelation(rSalaryUnemployment, "Median DS Salary", "Unemployment Rate")}
              </li>
              <li>
                <strong>Salary &amp; Corruption:</strong>{" "}
                {interpretCorrelation(rSalaryCorruption, "Median DS Salary", "Corruption Index")}
              </li>
              <li>
                <strong>Happiness &amp; Inflation:</strong>{" "}
                {interpretCorrelation(rHappinessInflation, "Happiness Index", "Inflation Rate")}
              </li>
            </ul>
            <p className="hint">Click any dot to open that country's detail page.</p>
          </div>

          <div className="explore-grid">
            {salaryVsHappiness.length >= 3 && (
              <div className="panel chart-panel">
                <h4>Salary vs Happiness Index</h4>
                <p className="chart-caption">
                  {interpretCorrelation(rSalaryHappiness, "Median DS Salary", "Happiness Index")}
                </p>
                <ScatterPlot
                  data={salaryVsHappiness}
                  xLabel="Median Salary (USD)"
                  yLabel="Happiness Index"
                  formatX={(v) => formatCurrency(v, 0)}
                  formatY={(v) => formatScore(v, 2)}
                  onSelect={handleSelect}
                />
              </div>
            )}

            {salaryVsUnemployment.length >= 3 && (
              <div className="panel chart-panel">
                <h4>Salary vs Unemployment Rate</h4>
                <p className="chart-caption">
                  {interpretCorrelation(rSalaryUnemployment, "Median DS Salary", "Unemployment Rate")}
                </p>
                <ScatterPlot
                  data={salaryVsUnemployment}
                  xLabel="Median Salary (USD)"
                  yLabel="Unemployment (%)"
                  formatX={(v) => formatCurrency(v, 0)}
                  formatY={(v) => formatPercent(v, 1)}
                  onSelect={handleSelect}
                />
              </div>
            )}

            {salaryVsCorruption.length >= 3 && (
              <div className="panel chart-panel">
                <h4>Salary vs Corruption Index</h4>
                <p className="chart-caption">
                  The Corruption Perceptions Index (CPI) ranges from 0 (highly corrupt) to 100 (very clean).{" "}
                  {interpretCorrelation(rSalaryCorruption, "Median DS Salary", "Corruption Index")}
                </p>
                <ScatterPlot
                  data={salaryVsCorruption}
                  xLabel="Median Salary (USD)"
                  yLabel="Corruption Index (CPI)"
                  formatX={(v) => formatCurrency(v, 0)}
                  formatY={(v) => formatScore(v, 0)}
                  onSelect={handleSelect}
                />
              </div>
            )}

            {happinessVsInflation.length >= 3 && (
              <div className="panel chart-panel">
                <h4>Happiness vs Inflation Rate</h4>
                <p className="chart-caption">
                  {interpretCorrelation(rHappinessInflation, "Happiness Index", "Inflation Rate")}
                </p>
                <ScatterPlot
                  data={happinessVsInflation}
                  xLabel="Happiness Index"
                  yLabel="Inflation Rate (%)"
                  formatX={(v) => formatScore(v, 2)}
                  formatY={(v) => formatPercent(v, 1)}
                  onSelect={handleSelect}
                />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default ExploreSection;
