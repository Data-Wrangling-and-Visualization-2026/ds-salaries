import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUSAProfessions, getUSAExperience, getCountrySeries, USAProfession, USAExperienceLevel } from "../api/client";
import BubbleChart from "../components/BubbleChart";
import BarChart from "../components/BarChart";
import MultiLineChart, { Series } from "../components/MultiLineChart";
import NavSidebar from "../components/NavSidebar";
import { CountryMetricYear } from "../types/metrics";
import { formatCurrency } from "../utils/format";

const USA_SECTIONS = [
  { id: "usa-professions", label: "Job Titles" },
  { id: "usa-experience", label: "Experience" },
  { id: "usa-correlations", label: "Correlations" },
];

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

const rLabel = (r: number): string => {
  const abs = Math.abs(r);
  const dir = r >= 0 ? "positive" : "negative";
  if (abs >= 0.7) return `strong ${dir}`;
  if (abs >= 0.4) return `moderate ${dir}`;
  if (abs >= 0.1) return `weak ${dir}`;
  return "no meaningful";
};

const USAPage = () => {
  const navigate = useNavigate();
  const [professions, setProfessions] = useState<USAProfession[]>([]);
  const [experience, setExperience] = useState<USAExperienceLevel[]>([]);
  const [usaSeries, setUsaSeries] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUSAProfessions(),
      getUSAExperience(),
      getCountrySeries("USA"),
    ])
      .then(([prof, exp, series]) => {
        setProfessions(prof);
        setExperience(exp);
        setUsaSeries(series.filter((r) => r.year >= 2020 && r.year <= 2025));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const bubbleData = useMemo(
    () =>
      professions.map((p) => ({
        label: p.job_title,
        size: p.count,
        value: p.median_salary,
      })),
    [professions]
  );

  const expBarData = useMemo(
    () =>
      experience.map((e) => ({
        label: e.experience_level,
        value: e.median_salary,
        iso3: "",
      })),
    [experience]
  );

  // Correlation trends — USA series over years
  const salarySeries = useMemo(
    () =>
      usaSeries
        .map((r) => ({ year: r.year, value: r.salary }))
        .filter((p) => p.value > 0),
    [usaSeries]
  );

  const correlationCharts = useMemo((): {
    label: string;
    series: Series[];
    r: number;
  }[] => {
    const salByYear = new Map(salarySeries.map((p) => [p.year, p.value]));

    const build = (
      key: keyof CountryMetricYear,
      label: string,
      color: string,
    ) => {
      const rawY = usaSeries
        .map((r) => ({ year: r.year, value: r[key] as number }))
        .filter((p) => p.value != null && Number.isFinite(p.value) && p.value !== 0);
      const yByYear = new Map(rawY.map((p) => [p.year, p.value]));
      const pairs = Array.from(salByYear.entries())
        .filter(([yr]) => yByYear.has(yr))
        .map(([yr, sal]) => ({ x: sal, y: yByYear.get(yr)! }));
      const r = pearsonR(pairs);

      // Find common base year (first year both series have data)
      const commonYears = salarySeries
        .map((p) => p.year)
        .filter((yr) => yByYear.has(yr))
        .sort((a, b) => a - b);
      if (commonYears.length === 0) return null;
      const baseYear = commonYears[0];

      const salIndexed = salarySeries
        .filter((p) => p.year >= baseYear)
        .map((p) => ({ year: p.year, value: (p.value / salarySeries.find((s) => s.year === baseYear)!.value) * 100 }));
      const metricIndexed = rawY
        .filter((p) => p.year >= baseYear)
        .map((p) => ({ year: p.year, value: (p.value / rawY.find((s) => s.year === baseYear)!.value) * 100 }));

      const series: Series[] = [];
      if (salIndexed.length > 0)
        series.push({ label: "Salary (indexed)", color: "#48a9ff", values: salIndexed });
      if (metricIndexed.length > 0)
        series.push({ label: `${label} (indexed)`, color, values: metricIndexed });
      return { label, series, r };
    };

    return [
      build("happiness", "Happiness Index", "#a78bfa"),
      build("inflation", "Inflation Rate", "#f97316"),
      build("unemployment", "Unemployment Rate", "#fb923c"),
      build("corruption", "Corruption Index", "#34d399"),
    ].filter((c): c is { label: string; series: Series[]; r: number } => c !== null && c.series.length > 0);
  }, [usaSeries, salarySeries]);

  return (
    <main className="page usa-page">
      <div className="sidebar-layout">
        <NavSidebar sections={USA_SECTIONS} />
        <div className="sidebar-content">
      <div className="country-header">
        <button className="back-button" onClick={() => navigate("/")}>
          ← Back to map
        </button>
        <h1>Data Science in the United States</h1>
        <p className="subtitle">
          Job market breakdown, experience level analysis, and salary correlations (2020–2025)
        </p>
      </div>

      {loading && <div className="loading">Loading USA data…</div>}

      {!loading && (
        <div className="usa-content">
          {/* Bubble chart */}
          {bubbleData.length > 0 && (
            <section className="panel" id="usa-professions">
              <h2>Top Job Titles by Popularity</h2>
              <p className="chart-caption">
                Bubble size = number of postings. Color = median salary (darker = higher salary).
              </p>
              <BubbleChart
                data={bubbleData}
                sizeLabel="Postings"
                valueLabel="Median Salary"
                formatValue={(v) => formatCurrency(v, 0)}
                formatSize={(v) => v.toLocaleString()}
                height={500}
              />
            </section>
          )}

          {/* Experience level bar chart */}
          {expBarData.length > 0 && (
            <section className="panel" id="usa-experience">
              <h2>Median Salary by Experience Level</h2>
              <p className="chart-caption">Based on all US data science roles in the dataset.</p>
              <BarChart
                data={expBarData}
                formatValue={(v) => formatCurrency(v, 0)}
                color="#48a9ff"
                onSelect={() => {}}
              />
            </section>
          )}

          {/* Salary correlation trends */}
          {correlationCharts.length > 0 && (
            <section className="panel" id="usa-correlations">
              <h2>Salary & Macro Indicator Trends</h2>
              <p className="chart-caption">
                How US median DS salary moved alongside key economic indicators over time.
              </p>
              <div className="usa-correlation-grid">
                {correlationCharts.map((c) => (
                  <div key={c.label} className="panel chart-panel">
                    <h3>Salary vs {c.label}</h3>
                    <p className="chart-caption">
                      Both indexed to 100 in the first available year. Correlation: <strong>{rLabel(c.r)}</strong> (r = {c.r.toFixed(2)})
                    </p>
                    <MultiLineChart series={c.series} height={200} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
      </div>
    </main>
  );
};

export default USAPage;
