import { useEffect, useMemo, useState } from "react";
import { getAvailableYears, getAvailableYearsForMetric, getCountryYearMetrics } from "../api/client";
import MetricFilters from "../components/MetricFilters";
import SidePanel from "../components/SidePanel";
import WorldMapHPI from "../components/WorldMapHPI";
import { CountryMetricYear, MetricKey } from "../types/metrics";

const HomePage = () => {
  const [year, setYear] = useState(2025);
  const [years, setYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<MetricKey>("salary");
  const [data, setData] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : "Failed to load available years.");
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
        setError(err instanceof Error ? err.message : "Failed to load metrics.");
      });
    return () => {
      active = false;
    };
  }, [year]);

  const selectedRow = useMemo(() => {
    if (!selectedIso3) return null;
    return data.find((row) => row.iso3 === selectedIso3) ?? null;
  }, [data, selectedIso3]);

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
    </main>
  );
};

export default HomePage;
