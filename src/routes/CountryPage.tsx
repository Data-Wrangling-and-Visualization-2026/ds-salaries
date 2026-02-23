import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCountrySeries } from "../api/client";
import LineChart from "../components/LineChart";
import { CountryMetricYear } from "../types/metrics";
import { formatCurrency, formatNumber } from "../utils/format";

const CountryPage = () => {
  const { iso3 } = useParams();
  const [series, setSeries] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iso3) return;
    let active = true;
    setLoading(true);
    setError(null);
    getCountrySeries(iso3.toUpperCase())
      .then((rows) => {
        if (!active) return;
        setSeries(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setSeries([]);
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load country series.");
      });
    return () => {
      active = false;
    };
  }, [iso3]);

  const latest = series[series.length - 1];

  const formatMaybe = (value: number, formatter: (value: number) => string) =>
    Number.isFinite(value) ? formatter(value) : "N/A";

  const salarySeries = useMemo(
    () =>
      series
        .map((row) => ({
          year: row.year,
          value: row.salary
        }))
        .filter((point) => Number.isFinite(point.value)),
    [series]
  );

  const countSeries = useMemo(
    () =>
      series
        .map((row) => ({
          year: row.year,
          value: row.count
        }))
        .filter((point) => Number.isFinite(point.value)),
    [series]
  );

  return (
    <main className="page country-page">
      <div className="country-header">
        <div>
          <h1>{latest?.country ?? iso3 ?? "Country"}</h1>
          <p className="subtitle">2020–2025 trends across salary and job volume.</p>
        </div>
      </div>

      {loading && <div className="loading">Loading country series…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && series.length === 0 && (
        <div className="panel">No data found for {iso3}.</div>
      )}

      {series.length > 0 && latest && (
        <div className="country-grid">
          <section className="panel summary-panel">
            <h2>{latest.year} snapshot</h2>
            <div className="metric-grid">
              <div>
                <span>Median salary</span>
                <strong>{formatMaybe(latest.salary, formatCurrency)}</strong>
              </div>
              <div>
                <span>Job count</span>
                <strong>{formatMaybe(latest.count, formatNumber)}</strong>
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
            <h2>Job count trend</h2>
            <LineChart
              data={countSeries}
              yLabel="records"
              formatValue={(value) => formatNumber(value)}
            />
          </section>
        </div>
      )}
    </main>
  );
};

export default CountryPage;
