import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getCountrySeries } from "../api/client";
import MultiLineChart, { Series } from "../components/MultiLineChart";
import NavSidebar from "../components/NavSidebar";
import { CountryMetricYear } from "../types/metrics";
import { formatCurrency, formatPercent, formatScore } from "../utils/format";

const COMPARISON_SECTIONS = [
  { id: "compare-snapshot", label: "Snapshot" },
  { id: "compare-trends", label: "Trends" },
];

const formatMaybe = (
  value: number | null | undefined,
  formatter: (v: number) => string
) => (value != null && Number.isFinite(value) ? formatter(value) : "N/A");

type MetricConfig = {
  key: keyof CountryMetricYear;
  label: string;
  format: (v: number) => string;
  color1: string;
  color2: string;
  yLabel?: string;
};

const METRICS: MetricConfig[] = [
  {
    key: "salary",
    label: "Median Salary (USD)",
    format: (v) => formatCurrency(v, 0),
    color1: "#48a9ff",
    color2: "#f97316",
    yLabel: "USD",
  },
  {
    key: "happiness",
    label: "Happiness Index",
    format: (v) => formatScore(v, 2),
    color1: "#48a9ff",
    color2: "#f97316",
    yLabel: "score",
  },
  {
    key: "inflation",
    label: "Inflation Rate (%)",
    format: (v) => formatPercent(v, 1),
    color1: "#48a9ff",
    color2: "#f97316",
    yLabel: "%",
  },
  {
    key: "unemployment",
    label: "Unemployment Rate (%)",
    format: (v) => formatPercent(v, 1),
    color1: "#48a9ff",
    color2: "#f97316",
    yLabel: "%",
  },
  {
    key: "corruption",
    label: "Corruption Index",
    format: (v) => formatScore(v, 0),
    color1: "#48a9ff",
    color2: "#f97316",
    yLabel: "score",
  },
];

const COUNTRY_COLORS = ["#48a9ff", "#f97316"];

const ComparisonPage = () => {
  const { iso3a, iso3b } = useParams<{ iso3a: string; iso3b: string }>();
  const navigate = useNavigate();
  const [seriesA, setSeriesA] = useState<CountryMetricYear[]>([]);
  const [seriesB, setSeriesB] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!iso3a || !iso3b) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getCountrySeries(iso3a.toUpperCase()),
      getCountrySeries(iso3b.toUpperCase()),
    ])
      .then(([a, b]) => {
        if (!active) return;
        setSeriesA(a.filter((r) => r.year >= 2020 && r.year <= 2025));
        setSeriesB(b.filter((r) => r.year >= 2020 && r.year <= 2025));
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load data.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [iso3a, iso3b]);

  const nameA = seriesA[0]?.country ?? iso3a ?? "Country A";
  const nameB = seriesB[0]?.country ?? iso3b ?? "Country B";
  const latestA = seriesA[seriesA.length - 1];
  const latestB = seriesB[seriesB.length - 1];

  const chartSeries = useMemo((): Record<string, Series[]> => {
    const result: Record<string, Series[]> = {};
    for (const m of METRICS) {
      const valuesA = seriesA
        .map((r) => ({ year: r.year, value: r[m.key] as number }))
        .filter((p) => p.value != null && Number.isFinite(p.value));
      const valuesB = seriesB
        .map((r) => ({ year: r.year, value: r[m.key] as number }))
        .filter((p) => p.value != null && Number.isFinite(p.value));

      const s: Series[] = [];
      if (valuesA.length > 0) s.push({ label: nameA, color: COUNTRY_COLORS[0], values: valuesA });
      if (valuesB.length > 0) s.push({ label: nameB, color: COUNTRY_COLORS[1], values: valuesB });
      if (s.length > 0) result[m.key] = s;
    }
    return result;
  }, [seriesA, seriesB, nameA, nameB]);

  return (
    <main className="page comparison-page">
      <div className="sidebar-layout">
        <NavSidebar sections={COMPARISON_SECTIONS} />
        <div className="sidebar-content">
      <div className="country-header">
        <button className="back-button" onClick={() => navigate("/")}>
          ← Back to map
        </button>
        <h1>
          <span style={{ color: COUNTRY_COLORS[0] }}>{nameA}</span>
          {" vs "}
          <span style={{ color: COUNTRY_COLORS[1] }}>{nameB}</span>
        </h1>
        <p className="subtitle">Side-by-side comparison of key indicators (2020–2025)</p>
      </div>

      {loading && <div className="loading">Loading comparison data…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && latestA && latestB && (
        <>
          {/* Snapshot cards */}
          <div className="comparison-snapshot" id="compare-snapshot">
            {METRICS.map((m) => {
              const vA = latestA[m.key] as number | null | undefined;
              const vB = latestB[m.key] as number | null | undefined;
              return (
                <div key={m.key} className="comparison-metric-card">
                  <div className="comparison-metric-label">{m.label}</div>
                  <div className="comparison-values">
                    <div style={{ color: COUNTRY_COLORS[0] }}>
                      <span className="comparison-country-name">{nameA}</span>
                      <strong>{formatMaybe(vA, m.format)}</strong>
                    </div>
                    <div className="comparison-divider">vs</div>
                    <div style={{ color: COUNTRY_COLORS[1] }}>
                      <span className="comparison-country-name">{nameB}</span>
                      <strong>{formatMaybe(vB, m.format)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trend charts */}
          <div className="comparison-charts" id="compare-trends">
            {METRICS.map((m) => {
              const s = chartSeries[m.key];
              if (!s) return null;
              return (
                <section key={m.key} className="panel chart-panel comparison-chart-panel">
                  <h2>{m.label} trend</h2>
                  <MultiLineChart series={s} />
                </section>
              );
            })}
          </div>
        </>
      )}
      </div>
      </div>
    </main>
  );
};

export default ComparisonPage;
