import { useRef } from "react";
import GlobeScene from "./GlobeScene";
import WelcomeText from "./WelcomeText";
import WorldMapHPI from "../../components/WorldMapHPI";
import MetricFilters from "../../components/MetricFilters";
import SidePanel from "../../components/SidePanel";
import BarChart from "../../components/BarChart";
import { getCountryYearMetrics, getAvailableYears } from "../../api/client";
import { CountryMetricYear, MetricKey } from "../../types/metrics";
import { metricMeta } from "../../utils/metricMeta";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./WelcomePage.css";

const WelcomePage = () => {
  const navigate = useNavigate();
  const dataSectionRef = useRef<HTMLDivElement>(null);
  
  // Состояния для данных карты
  const [year, setYear] = useState(2025);
  const [years, setYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<MetricKey>("salary");
  const [data, setData] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);

  // Загрузка годов
  useEffect(() => {
    const loadYears = async () => {
      try {
        const available = await getAvailableYears();
        setYears(available);
        if (available.length > 0 && !available.includes(year)) {
          setYear(available[available.length - 1]);
        }
      } catch (err) {
        console.error("Failed to load years:", err);
      }
    };
    loadYears();
  }, []);

  // Загрузка данных
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

  const meta = metricMeta[metric];

  const rankingData = useMemo(() => {
    const valid: any[] = [];
    for (const row of data) {
      const value = meta.accessor(row as Record<string, unknown>);
      if (value != null && Number.isFinite(value) && (value as number) > 0) {
        valid.push({ label: row.country, value: value as number, iso3: row.iso3 });
      }
    }

    if (!meta.isPositive) {
      return valid.sort((a, b) => a.value - b.value).slice(0, 10);
    }
    return valid.sort((a, b) => b.value - a.value).slice(0, 10);
  }, [data, meta]);

  const rankingLabel = meta.isPositive ? "Top 10 countries" : "10 lowest countries";
  const rankingCaption = meta.isPositive
    ? `Countries with the highest ${meta.label.toLowerCase()} in ${year}.`
    : `Countries with the lowest ${meta.label.toLowerCase()} in ${year} — lower is better.`;

  const scrollToData = () => {
    dataSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="welcome-page">
      {/* Первая секция: глобус + текст */}
      <section className="hero-section">
        <div className="globe-wrapper">
          <GlobeScene />
        </div>
        <div className="text-wrapper">
          <WelcomeText onExploreClick={scrollToData} />
        </div>
      </section>

      {/* Вторая секция: карта и данные */}
      <section ref={dataSectionRef} className="data-section">
        <div className="container">
          <div className="section-header">
            <h2>Global Metrics Explorer</h2>
            <p>Interactive world map with economic and social indicators</p>
          </div>

          <MetricFilters
            metric={metric}
            year={year}
            years={years}
            onMetricChange={setMetric}
            onYearChange={(value) => {
              setYear(value);
              setSelectedIso3(null);
            }}
          />

          {loading && <div className="loading">Loading metrics...</div>}
          {error && <div className="error-banner">{error}</div>}

          <div className="map-with-panel">
            <div className="map-container">
              <WorldMapHPI
                data={data}
                metric={metric}
                selectedIso3={selectedIso3}
                onSelect={(iso3) => setSelectedIso3(iso3)}
              />
            </div>
            <SidePanel data={selectedRow} metric={metric} />
          </div>

          {rankingData.length > 0 && (
            <div className="rankings-container">
              <h3>{rankingLabel} — {meta.label} ({year})</h3>
              <p className="caption">{rankingCaption}</p>
              <BarChart
                data={rankingData}
                formatValue={meta.format}
                color={meta.isPositive ? "#48a9ff" : "#f97316"}
                onSelect={(iso3) => navigate(`/country/${iso3}`)}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WelcomePage;