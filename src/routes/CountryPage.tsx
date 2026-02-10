import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCountrySeries } from "../api/client";
import LineChart from "../components/LineChart";
import MultiLineChart from "../components/MultiLineChart";
import { CountryMetricYear } from "../types/metrics";
import { formatCurrency, formatPercent } from "../utils/format";

const CountryPage = () => {
  const { iso3 } = useParams();
  const [series, setSeries] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [normalizeSalary, setNormalizeSalary] = useState(false);

  useEffect(() => {
    if (!iso3) return;
    let active = true;
    setLoading(true);
    getCountrySeries(iso3.toUpperCase()).then((rows) => {
      if (!active) return;
      setSeries(rows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [iso3]);

  const latest = series[series.length - 1];

  const salarySeries = useMemo(
    () =>
      series.map((row) => ({
        year: row.year,
        value: normalizeSalary
          ? row.avg_salary_usd / (1 + row.inflation / 100)
          : row.avg_salary_usd
      })),
    [series, normalizeSalary]
  );

  const multiSeries = useMemo(
    () => [
      {
        label: "Happiness",
        color: "#57c4ad",
        values: series.map((row) => ({ year: row.year, value: row.happiness }))
      },
      {
        label: "Inflation",
        color: "#f97316",
        values: series.map((row) => ({ year: row.year, value: row.inflation }))
      }
    ],
    [series]
  );

  return (
    <main className="page country-page">
      <div className="country-header">
        <div>
          <h1>{latest?.country ?? "Country"}</h1>
          <p className="subtitle">
            2020–2025 trends across salary, happiness, and macro signals.
          </p>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={normalizeSalary}
            onChange={(event) => setNormalizeSalary(event.target.checked)}
          />
          <span>Use real salary (inflation-adjusted)</span>
        </label>
      </div>

      {loading && <div className="loading">Loading country series…</div>}

      {!loading && series.length === 0 && (
        <div className="panel">No data found for {iso3}.</div>
      )}

      {series.length > 0 && latest && (
        <div className="country-grid">
          <section className="panel summary-panel">
            <h2>2025 snapshot</h2>
            <div className="metric-grid">
              <div>
                <span>Average salary</span>
                <strong>{formatCurrency(latest.avg_salary_usd)}</strong>
              </div>
              <div>
                <span>Inflation</span>
                <strong>{formatPercent(latest.inflation)}</strong>
              </div>
              <div>
                <span>Unemployment</span>
                <strong>{formatPercent(latest.unemployment)}</strong>
              </div>
              <div>
                <span>Happiness</span>
                <strong>{latest.happiness.toFixed(1)}</strong>
              </div>
            </div>
          </section>

          <section className="panel chart-panel">
            <h2>Salary trend</h2>
            <LineChart
              data={salarySeries}
              yLabel="USD"
              formatValue={(value) => formatCurrency(value)}
            />
          </section>

          <section className="panel chart-panel">
            <h2>Happiness vs Inflation</h2>
            <MultiLineChart series={multiSeries} />
          </section>
        </div>
      )}
    </main>
  );
};

export default CountryPage;
