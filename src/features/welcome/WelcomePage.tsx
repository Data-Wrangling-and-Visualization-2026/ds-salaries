import { useRef } from "react";
import GlobeScene from "./GlobeScene";
import WelcomeText from "./WelcomeText";
import WorldMapHPI from "../../components/WorldMapHPI";
import MetricFilters from "../../components/MetricFilters";
import SidePanel from "../../components/SidePanel";
import UsaSection from "./UsaSection";
import { getCountryYearMetrics, getAvailableYears } from "../../api/client";
import { CountryMetricYear, MetricKey } from "../../types/metrics";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./WelcomePage.css";

const WelcomePage = () => {
  const navigate = useNavigate();
  const dataSectionRef = useRef<HTMLDivElement>(null);

  const [year, setYear] = useState(2025);
  const [years, setYears] = useState<number[]>([]);
  const [metric, setMetric] = useState<MetricKey>("salary");
  const [data, setData] = useState<CountryMetricYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

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

  const handleCountrySelect = (iso3: string) => {
    setSelectedCountries((prev) => {
      if (prev.includes(iso3)) {
        // Deselect
        return prev.filter((c) => c !== iso3);
      }
      if (prev.length < 2) {
        return [...prev, iso3];
      }
      // Replace first with new one, keep second
      return [prev[1], iso3];
    });
  };

  const selectedRow = useMemo(() => {
    const iso3 = selectedCountries[0] ?? null;
    if (!iso3) return null;
    return data.find((row) => row.iso3 === iso3) ?? null;
  }, [data, selectedCountries]);

  const scrollToData = () => {
    dataSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="welcome-page">
      {/* Hero: globe + text */}
      <section className="hero-section">
        <div className="globe-wrapper">
          <GlobeScene />
        </div>
        <div className="text-wrapper">
          <WelcomeText onExploreClick={scrollToData} />
        </div>
      </section>

      {/* Data section */}
      <section ref={dataSectionRef} className="data-section" id="explore">
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
              setSelectedCountries([]);
            }}
          />

          {loading && <div className="loading">Loading metrics...</div>}
          {error && <div className="error-banner">{error}</div>}

          <div className="map-with-panel">
            <div className="map-container">
              <WorldMapHPI
                data={data}
                metric={metric}
                selectedCountries={selectedCountries}
                onSelect={(iso3) => handleCountrySelect(iso3)}
              />
              {selectedCountries.length === 2 && (() => {
                const rowA = data.find((r) => r.iso3 === selectedCountries[0]);
                const rowB = data.find((r) => r.iso3 === selectedCountries[1]);
                const canCompare = rowA && rowA.salary > 0 && rowB && rowB.salary > 0;
                return (
                  <div className="compare-bar">
                    <span className="compare-label">
                      <span className="compare-dot compare-dot--primary" />
                      {rowA?.country ?? selectedCountries[0]}
                    </span>
                    <span className="compare-label">
                      <span className="compare-dot compare-dot--secondary" />
                      {rowB?.country ?? selectedCountries[1]}
                    </span>
                    {canCompare ? (
                      <button
                        className="primary-button compare-button"
                        onClick={() =>
                          navigate(`/compare/${selectedCountries[0]}/${selectedCountries[1]}`)
                        }
                      >
                        Compare
                      </button>
                    ) : (
                      <span className="compare-no-salary">
                        One or both countries have no salary data
                      </span>
                    )}
                    <button
                      className="secondary-button"
                      onClick={() => setSelectedCountries([])}
                    >
                      Clear
                    </button>
                  </div>
                );
              })()}
            </div>
            <SidePanel data={selectedRow} metric={metric} />
          </div>

          <div className="data-attribution">
            Salary data:{" "}
            <a
              href="https://www.kaggle.com/datasets/chopper53/machine-learning-engineer-salary-in-2024"
              target="_blank"
              rel="noopener noreferrer"
            >
              AI/DS Salaries 2025 — Kaggle
            </a>
          </div>
        </div>
      </section>

      {/* USA section */}
      <section className="data-section">
        <div className="container">
          <UsaSection />
        </div>
      </section>

    </div>
  );
};

export default WelcomePage;
