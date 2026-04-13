import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCountrySeries } from "../api/client";
import LineChart from "../components/LineChart";
import MultiLineChart, { Series } from "../components/MultiLineChart";
import { CountryMetricYear } from "../types/metrics";
import { formatCurrency, formatNumber, formatPercent, formatScore } from "../utils/format";

const formatMaybe = (
  value: number | null | undefined,
  formatter: (value: number) => string
) => (value != null && Number.isFinite(value) ? formatter(value) : "N/A");

// Year-over-year delta as a percentage (or absolute for happiness/corruption)
const yoyDelta = (
  current: number | null | undefined,
  previous: number | null | undefined
): { pct: number; abs: number } | null => {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  )
    return null;
  return {
    pct: ((current - previous) / Math.abs(previous)) * 100,
    abs: current - previous,
  };
};

const DeltaBadge = ({
  delta,
  isPositive,
  fmt,
}: {
  delta: { pct: number; abs: number } | null;
  isPositive: boolean; // whether an increase is good
  fmt?: "pct" | "abs";
}) => {
  if (!delta) return null;
  const up = delta.pct > 0;
  const good = isPositive ? up : !up;
  const display =
    fmt === "abs"
      ? `${delta.abs > 0 ? "+" : ""}${delta.abs.toFixed(1)}`
      : `${delta.pct > 0 ? "+" : ""}${delta.pct.toFixed(1)}%`;
  return (
    <span className={`delta-badge ${good ? "delta-good" : "delta-bad"}`}>
      {up ? "▲" : "▼"} {display}
    </span>
  );
};

const trendSummary = (
  series: { year: number; value: number }[],
  formatter: (v: number) => string
): string | null => {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const pct = ((last.value - first.value) / Math.abs(first.value)) * 100;
  const dir = pct > 0 ? "↑" : "↓";
  const sign = pct > 0 ? "+" : "";
  return `${dir} ${sign}${pct.toFixed(1)}% from ${formatter(first.value)} (${first.year}) to ${formatter(last.value)} (${last.year})`;
};

const buildKeyInsights = (
  salarySeries: { year: number; value: number }[],
  inflationSeries: { year: number; value: number }[],
  happinessSeries: { year: number; value: number }[],
  countSeries: { year: number; value: number }[],
  corruptionSeries: { year: number; value: number }[]
): string[] => {
  const insights: string[] = [];

  // 1. Salary growth
  if (salarySeries.length >= 2) {
    const first = salarySeries[0];
    const last = salarySeries[salarySeries.length - 1];
    const pct = ((last.value - first.value) / Math.abs(first.value)) * 100;
    if (pct > 5)
      insights.push(
        `Median DS salary grew ${pct.toFixed(0)}% from ${first.year} to ${last.year} (${formatCurrency(first.value, 0)} → ${formatCurrency(last.value, 0)}).`
      );
    else if (pct < -5)
      insights.push(
        `Median DS salary declined ${Math.abs(pct).toFixed(0)}% from ${first.year} to ${last.year} (${formatCurrency(first.value, 0)} → ${formatCurrency(last.value, 0)}).`
      );
    else
      insights.push(
        `Median DS salary remained broadly stable over the period (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%).`
      );
  }

  // 2. Real wage analysis
  if (salarySeries.length >= 2 && inflationSeries.length >= 2) {
    const salaryPct =
      ((salarySeries[salarySeries.length - 1].value - salarySeries[0].value) /
        Math.abs(salarySeries[0].value)) *
      100;
    const cumInflation =
      (inflationSeries.reduce((acc, p) => acc * (1 + p.value / 100), 1) - 1) *
      100;
    if (salaryPct > cumInflation + 3) {
      insights.push(
        `With cumulative inflation of ${cumInflation.toFixed(1)}%, salary growth outpaced price increases — real purchasing power improved.`
      );
    } else if (salaryPct < cumInflation - 3) {
      insights.push(
        `Despite nominal salary gains, cumulative inflation of ${cumInflation.toFixed(1)}% eroded real purchasing power over the period.`
      );
    } else {
      insights.push(
        `Salary growth roughly matched cumulative inflation (${cumInflation.toFixed(1)}%), leaving real purchasing power approximately stable.`
      );
    }
  }

  // 3. Happiness
  if (happinessSeries.length >= 2) {
    const delta =
      happinessSeries[happinessSeries.length - 1].value -
      happinessSeries[0].value;
    if (delta > 0.1)
      insights.push(
        `Happiness index improved by ${delta.toFixed(2)} points, suggesting rising well-being among residents.`
      );
    else if (delta < -0.1)
      insights.push(
        `Happiness index declined by ${Math.abs(delta).toFixed(2)} points over the period.`
      );
  }

  // 4. Job market
  if (countSeries.length >= 2) {
    const growth =
      ((countSeries[countSeries.length - 1].value - countSeries[0].value) /
        Math.abs(countSeries[0].value)) *
      100;
    if (growth > 15)
      insights.push(
        `The DS job market expanded significantly — recorded positions grew ${growth.toFixed(0)}%.`
      );
    else if (growth < -15)
      insights.push(
        `Recorded DS positions declined ${Math.abs(growth).toFixed(0)}%, which may reflect data coverage changes or a contracting market.`
      );
  }

  // 5. Corruption
  if (corruptionSeries.length >= 2) {
    const delta =
      corruptionSeries[corruptionSeries.length - 1].value -
      corruptionSeries[0].value;
    if (delta > 3)
      insights.push(
        `Corruption perception improved by ${delta.toFixed(0)} CPI points — a sign of strengthening governance.`
      );
    else if (delta < -3)
      insights.push(
        `Corruption perception worsened by ${Math.abs(delta).toFixed(0)} CPI points, which may affect business environment and talent retention.`
      );
  }

  return insights;
};

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
  const previous = series.length >= 2 ? series[series.length - 2] : null;

  const salarySeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.salary }))
        .filter((p) => Number.isFinite(p.value) && p.value > 0),
    [series]
  );

  const countSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.count }))
        .filter((p) => Number.isFinite(p.value) && p.value > 0),
    [series]
  );

  const happinessSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.happiness ?? NaN }))
        .filter((p) => Number.isFinite(p.value)),
    [series]
  );

  const inflationSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.inflation ?? NaN }))
        .filter((p) => Number.isFinite(p.value)),
    [series]
  );

  const unemploymentSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.unemployment ?? NaN }))
        .filter((p) => Number.isFinite(p.value)),
    [series]
  );

  const corruptionSeries = useMemo(
    () =>
      series
        .map((row) => ({ year: row.year, value: row.corruption ?? NaN }))
        .filter((p) => Number.isFinite(p.value)),
    [series]
  );

  // Normalized salary vs price-level index for the combined chart
  const realWageSeries = useMemo<Series[]>(() => {
    if (salarySeries.length < 2 || inflationSeries.length < 2) return [];

    const salaryByYear = new Map(salarySeries.map((p) => [p.year, p.value]));
    const inflationByYear = new Map(inflationSeries.map((p) => [p.year, p.value]));
    const years = Array.from(
      new Set([...salaryByYear.keys(), ...inflationByYear.keys()])
    ).sort((a, b) => a - b);

    const baseYear = years[0];
    const baseSalary = salaryByYear.get(baseYear);
    if (!baseSalary) return [];

    const salaryIndexed: { year: number; value: number }[] = [];
    const priceIndexed: { year: number; value: number }[] = [];

    let priceLevel = 100;
    for (const yr of years) {
      const sal = salaryByYear.get(yr);
      if (sal != null) {
        salaryIndexed.push({ year: yr, value: (sal / baseSalary) * 100 });
      }
      if (yr > baseYear) {
        const inf = inflationByYear.get(yr) ?? 0;
        priceLevel *= 1 + inf / 100;
      }
      if (inflationByYear.has(yr) || yr === baseYear) {
        priceIndexed.push({ year: yr, value: priceLevel });
      }
    }

    return [
      { label: `Salary index (${baseYear}=100)`, color: "#48a9ff", values: salaryIndexed },
      { label: `Price level index (${baseYear}=100)`, color: "#f97316", values: priceIndexed },
    ];
  }, [salarySeries, inflationSeries]);

  const insights = useMemo(
    () =>
      buildKeyInsights(
        salarySeries,
        inflationSeries,
        happinessSeries,
        countSeries,
        corruptionSeries
      ),
    [salarySeries, inflationSeries, happinessSeries, countSeries, corruptionSeries]
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

          {/* Snapshot */}
          <section className="panel summary-panel">
            <h2>
              {latest.year} snapshot
              {previous && (
                <span className="snapshot-vs"> vs {previous.year}</span>
              )}
            </h2>
            <div className="metric-grid">
              <div>
                <span>Median salary</span>
                <strong>{formatMaybe(latest.salary || null, formatCurrency)}</strong>
                <DeltaBadge
                  delta={yoyDelta(latest.salary, previous?.salary)}
                  isPositive={true}
                />
              </div>
              <div>
                <span>Job count</span>
                <strong>{formatMaybe(latest.count || null, formatNumber)}</strong>
                <DeltaBadge
                  delta={yoyDelta(latest.count, previous?.count)}
                  isPositive={true}
                />
              </div>
              <div>
                <span>Happiness Index</span>
                <strong>{formatMaybe(latest.happiness, (v) => formatScore(v, 2))}</strong>
                <DeltaBadge
                  delta={yoyDelta(latest.happiness, previous?.happiness)}
                  isPositive={true}
                  fmt="abs"
                />
              </div>
              <div>
                <span>Inflation Rate</span>
                <strong>{formatMaybe(latest.inflation, formatPercent)}</strong>
                <DeltaBadge
                  delta={yoyDelta(latest.inflation, previous?.inflation)}
                  isPositive={false}
                  fmt="abs"
                />
              </div>
              <div>
                <span>Unemployment Rate</span>
                <strong>{formatMaybe(latest.unemployment, formatPercent)}</strong>
                <DeltaBadge
                  delta={yoyDelta(latest.unemployment, previous?.unemployment)}
                  isPositive={false}
                  fmt="abs"
                />
              </div>
              <div>
                <span>Corruption Index</span>
                <strong>{formatMaybe(latest.corruption, (v) => formatScore(v, 0))}</strong>
                <DeltaBadge
                  delta={yoyDelta(latest.corruption, previous?.corruption)}
                  isPositive={true}
                  fmt="abs"
                />
              </div>
            </div>
          </section>

          {/* Key insights */}
          {insights.length > 0 && (
            <section className="panel insight-panel">
              <h2>Key insights</h2>
              <ul className="insight-list">
                {insights.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Combined real-wage chart */}
          {realWageSeries.length > 0 && (
            <section className="panel chart-panel chart-panel--wide">
              <h2>Real purchasing power: salary vs price level</h2>
              <p className="chart-caption">
                Both indexed to 100 in the first available year. When the salary
                line stays above the price level line, real wages are growing.
              </p>
              <MultiLineChart series={realWageSeries} />
            </section>
          )}

          {/* Individual trend charts */}
          {salarySeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Salary trend</h2>
              <LineChart
                data={salarySeries}
                yLabel="USD"
                formatValue={(v) => formatCurrency(v)}
              />
              {trendSummary(salarySeries, (v) => formatCurrency(v, 0)) && (
                <p className="chart-caption">
                  {trendSummary(salarySeries, (v) => formatCurrency(v, 0))}
                </p>
              )}
            </section>
          )}

          {countSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Job count trend</h2>
              <LineChart
                data={countSeries}
                yLabel="records"
                formatValue={(v) => formatNumber(v)}
              />
              {trendSummary(countSeries, (v) => formatNumber(v)) && (
                <p className="chart-caption">
                  {trendSummary(countSeries, (v) => formatNumber(v))}
                </p>
              )}
            </section>
          )}

          {happinessSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Happiness Index trend</h2>
              <LineChart
                data={happinessSeries}
                yLabel="score"
                formatValue={(v) => formatScore(v, 2)}
              />
              {trendSummary(happinessSeries, (v) => formatScore(v, 2)) && (
                <p className="chart-caption">
                  {trendSummary(happinessSeries, (v) => formatScore(v, 2))}
                </p>
              )}
            </section>
          )}

          {inflationSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Inflation Rate trend</h2>
              <LineChart
                data={inflationSeries}
                yLabel="%"
                formatValue={(v) => formatPercent(v, 1)}
              />
              {trendSummary(inflationSeries, (v) => formatPercent(v, 1)) && (
                <p className="chart-caption">
                  {trendSummary(inflationSeries, (v) => formatPercent(v, 1))}
                </p>
              )}
            </section>
          )}

          {unemploymentSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Unemployment Rate trend</h2>
              <LineChart
                data={unemploymentSeries}
                yLabel="%"
                formatValue={(v) => formatPercent(v, 1)}
              />
              {trendSummary(unemploymentSeries, (v) => formatPercent(v, 1)) && (
                <p className="chart-caption">
                  {trendSummary(unemploymentSeries, (v) => formatPercent(v, 1))}
                </p>
              )}
            </section>
          )}

          {corruptionSeries.length > 0 && (
            <section className="panel chart-panel">
              <h2>Corruption Index trend</h2>
              <LineChart
                data={corruptionSeries}
                yLabel="score"
                formatValue={(v) => formatScore(v, 0)}
              />
              {trendSummary(corruptionSeries, (v) => formatScore(v, 0)) && (
                <p className="chart-caption">
                  {trendSummary(corruptionSeries, (v) => formatScore(v, 0))}
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
};

export default CountryPage;
