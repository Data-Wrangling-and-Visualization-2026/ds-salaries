import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCountrySeries } from "../api/client";
import LineChart from "../components/LineChart";
import { CountryMetricYear } from "../types/metrics";
import { formatCurrency, formatNumber, formatPercent, formatScore } from "../utils/format";

const formatMaybe = (
  value: number | null | undefined,
  formatter: (value: number) => string
) => (value != null && Number.isFinite(value) ? formatter(value) : "N/A");

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

  const salarySeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.salary }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0),
    [series]
  );

  const countSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.count }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0),
    [series]
  );

  const happinessSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.happiness ?? NaN }))
        .filter((point) => Number.isFinite(point.value)),
    [series]
  );

  const inflationSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.inflation ?? NaN }))
        .filter((point) => Number.isFinite(point.value)),
    [series]
  );

  const unemploymentSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.unemployment ?? NaN }))
        .filter((point) => Number.isFinite(point.value)),
    [series]
  );

  const corruptionSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.corruption ?? NaN }))
        .filter((point) => Number.isFinite(point.value)),
    [series]
  );

  return (
    <main className="page country-page">
      <div className="country-header">
        <div>
          <h1>{latest?.country ?? iso3 ?? "Country"}</h1>
          <p className="subtitle">2020–2025 trends across salary, well-being, and macro indicators.</p>
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
                <strong>{formatMaybe(latest.salary || null, formatCurrency)}</strong>
              </div>
              <div>
                <span>Job count</span>
                <strong>{formatMaybe(latest.count || null, formatNumber)}</strong>
              </div>
              <div>
                <span>Happiness Index</span>
                <strong>{formatMaybe(latest.happiness, (v) => formatScore(v, 2))}</strong>
              </div>
              <div>
                <span>Inflation Rate</span>
                <strong>{formatMaybe(latest.inflation, formatPercent)}</strong>
              </div>
              <div>
                <span>Unemployment Rate</span>
                <strong>{formatMaybe(latest.unemployment, formatPercent)}</strong>
              </div>
              <div>
                <span>Corruption Index</span>
                <strong>{formatMaybe(latest.corruption, (v) => formatScore(v, 0))}</strong>
              </div>
            </div>
          </section>

          {salarySeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Salary trend</h2>
              <LineChart
                data={salarySeries}
                yLabel="USD"
                formatValue={(value) => formatCurrency(value)}
              />
            </section>
          )}

          {countSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Job count trend</h2>
              <LineChart
                data={countSeries}
                yLabel="records"
                formatValue={(value) => formatNumber(value)}
              />
            </section>
          )}

          {happinessSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Happiness Index trend</h2>
              <LineChart
                data={happinessSeries}
                yLabel="score"
                formatValue={(value) => formatScore(value, 2)}
              />
            </section>
          )}

          {inflationSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Inflation Rate trend</h2>
              <LineChart
                data={inflationSeries}
                yLabel="%"
                formatValue={(value) => formatPercent(value, 1)}
              />
            </section>
          )}

          {unemploymentSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Unemployment Rate trend</h2>
              <LineChart
                data={unemploymentSeries}
                yLabel="%"
                formatValue={(value) => formatPercent(value, 1)}
              />
            </section>
          )}

          {corruptionSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Corruption Index trend</h2>
              <LineChart
                data={corruptionSeries}
                yLabel="score"
                formatValue={(value) => formatScore(value, 0)}
              />
            </section>
          )}
        </div>
      )}
    </main>
  );
};

export default CountryPage;
