import { useEffect, useMemo, useState } from "react";
import { getCountryYearMetrics } from "../api/client";
import MetricFilters from "../components/MetricFilters";
import SidePanel from "../components/SidePanel";
import WorldChoroplethMap from "../components/WorldChoroplethMap";
import { CountryMetricYear, MetricKey } from "../types/metrics";

const HomePage = () => {
  const [year, setYear] = useState(2025);
  const [metric, setMetric] = useState<MetricKey>("avg_salary_usd");
  const [normalizeSalary, setNormalizeSalary] = useState(false);
  const [data, setData] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCountryYearMetrics(year).then((rows) => {
      if (!active) return;
      setData(rows);
      setLoading(false);
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
          normalizeSalary={normalizeSalary}
          onMetricChange={setMetric}
          onYearChange={(value) => {
            setYear(value);
            setSelectedIso3(null);
          }}
          onToggleNormalize={setNormalizeSalary}
        />
        <section className="panel map-panel">
          {loading && <div className="loading">Loading metrics…</div>}
          <WorldChoroplethMap
            data={data}
            metric={metric}
            normalizeSalary={normalizeSalary}
            selectedIso3={selectedIso3}
            onSelect={(iso3) => setSelectedIso3(iso3)}
          />
        </section>
        <SidePanel data={selectedRow} metric={metric} normalizedSalary={normalizeSalary} />
      </div>
    </main>
  );
};

export default HomePage;
