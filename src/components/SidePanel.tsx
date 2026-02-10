import { Link } from "react-router-dom";
import { CountryMetricYear, MetricKey } from "../types/metrics";
import { metricMeta } from "../utils/metricMeta";

const metricKeys: MetricKey[] = [
  "avg_salary_usd",
  "happiness",
  "inflation",
  "unemployment",
  "cpi",
  "composite_score"
];

type Props = {
  data: CountryMetricYear | null;
  metric: MetricKey;
  normalizedSalary: boolean;
};

const SidePanel = ({ data, metric, normalizedSalary }: Props) => {
  if (!data) {
    return (
      <aside className="panel side-panel empty">
        <h2>Country Insights</h2>
        <p>Select a country on the map to see detailed metrics.</p>
      </aside>
    );
  }

  const displayValue =
    metric === "avg_salary_usd" && normalizedSalary
      ? data.avg_salary_usd / (1 + data.inflation / 100)
      : data[metric];

  return (
    <aside className="panel side-panel">
      <h2>{data.country}</h2>
      <div className="year">{data.year}</div>
      <div className="highlight">
        <div className="label">{metricMeta[metric].label}</div>
        <div className="value">{metricMeta[metric].format(displayValue)}</div>
      </div>
      <div className="metric-list">
        {metricKeys.map((key) => (
          <div key={key} className="metric-row">
            <span>{metricMeta[key].label}</span>
            <strong>{metricMeta[key].format(data[key])}</strong>
          </div>
        ))}
      </div>
      <Link className="primary-button" to={`/country/${data.iso3}`}>
        Open country view
      </Link>
    </aside>
  );
};

export default SidePanel;
