import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAvailableYears,
  getAvailableYearsForMetric,
  getCountryYearMetrics,
} from "../api/client";
import BarChart, { BarDatum } from "../components/BarChart";
import MetricFilters from "../components/MetricFilters";
import SidePanel from "../components/SidePanel";
import WorldMapHPI from "../components/WorldMapHPI";
import { CountryMetricYear, MetricKey } from "../types/metrics";
import { metricMeta } from "../utils/metricMeta";

const HomePage = () => {
  const [year, setYear] = useState(2025);
  const [years, setYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<MetricKey>("salary");
  const [data, setData] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getAvailableYears()
      .then((available) => {
        if (!active) return;
        setYears(available);
        if (available.length > 0 && !available.includes(year)) {
          setYear(available[available.length - 1]);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load available years."
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const handleMetricChange = (newMetric: MetricKey) => {
    setMetric(newMetric);
    getAvailableYearsForMetric(newMetric).then((available) => {
      if (available.length > 0 && !available.includes(year)) {
        setYear(available[available.length - 1]);
      }
    });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getCountryYearMetrics(year)
      .then((rows) => {
        if (!active) return;
        setData(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setData([]);
        setLoading(false);
        setError(
          err instanceof Error ? err.message : "Failed to load metrics."
        );
      });
    return () => {
      active = false;
    };
  }, [year]);

  const selectedRow = useMemo(() => {
    if (!selectedIso3) return null;
    return data.find((row) => row.iso3 === selectedIso3) ?? null;
  }, [data, selectedIso3]);

  const meta = metricMeta[metric];

  // Top 10 countries for the selected metric
  const rankingData = useMemo<BarDatum[]>(() => {
    const valid: BarDatum[] = [];
    for (const row of data) {
      const value = meta.accessor(row as Record<string, unknown>);
      if (value != null && Number.isFinite(value) && (value as number) > 0) {
        valid.push({ label: row.country, value: value as number, iso3: row.iso3 });
      }
    }

    // For negative metrics (inflation, unemployment) rank ascending (lower = better)
    if (!meta.isPositive) {
      return valid.sort((a, b) => a.value - b.value).slice(0, 10);
    }
    return valid.sort((a, b) => b.value - a.value).slice(0, 10);
  }, [data, meta]);

  const rankingLabel = meta.isPositive ? "Top 10 countries" : "10 lowest countries";
  const rankingCaption = meta.isPositive
    ? `Countries with the highest ${meta.label.toLowerCase()} in ${year}. Click a bar to view the country's full trend.`
    : `Countries with the lowest ${meta.label.toLowerCase()} in ${year} — lower is better for this metric. Click a bar to view the country's full trend.`;

  return (
    <main className="page home-page">
      <div className="content-grid">
        <MetricFilters
          metric={metric}
          year={year}
          years={years}
          onMetricChange={handleMetricChange}
          onYearChange={(value) => {
            setYear(value);
            setSelectedIso3(null);
          }}
        />
        <section className="panel map-panel">
          {loading && <div className="loading">Loading metrics…</div>}
          {error && <div className="error-banner">{error}</div>}
          <WorldMapHPI
            data={data}
            metric={metric}
            selectedIso3={selectedIso3}
            onSelect={(iso3) => setSelectedIso3(iso3)}
          />
        </section>
        <SidePanel data={selectedRow} metric={metric} />
      </div>

      {rankingData.length > 0 && (
        <section className="panel rankings-panel">
          <h2>
            {rankingLabel} — {meta.label} ({year})
          </h2>
          <p className="chart-caption">{rankingCaption}</p>
          <BarChart
            data={rankingData}
            formatValue={meta.format}
            color={meta.isPositive ? "#48a9ff" : "#f97316"}
            onSelect={(iso3) => navigate(`/country/${iso3}`)}
          />
        </section>
      )}
    </main>
  );
};

export default HomePage;
