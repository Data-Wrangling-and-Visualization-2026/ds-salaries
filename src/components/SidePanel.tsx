import { Link } from "react-router-dom";
import { CountryMetricYear, MetricKey } from "../types/metrics";
import { metricMeta } from "../utils/metricMeta";

const metricKeys: MetricKey[] = ["salary", "count"];

const formatMaybe = (value: number, formatter: (value: number) => string) =>
  Number.isFinite(value) ? formatter(value) : "N/A";

type Props = {
  data: CountryMetricYear | null;
  metric: MetricKey;
};

const SidePanel = ({ data, metric }: Props) => {
  if (!data) {
    return (
      <aside className="panel side-panel empty">
        <h2>Country Insights</h2>
        <p>Select a country on the map to see detailed metrics.</p>
      </aside>
    );
  }

  const displayValue = data[metric];

  return (
    <aside className="panel side-panel">
      <h2>{data.country}</h2>
      <div className="year">{data.year}</div>
      <div className="highlight">
        <div className="label">{metricMeta[metric].label}</div>
        <div className="value">
          {formatMaybe(displayValue, metricMeta[metric].format)}
        </div>
      </div>
      <div className="metric-list">
        {metricKeys.map((key) => (
          <div key={key} className="metric-row">
            <span>{metricMeta[key].label}</span>
            <strong>{formatMaybe(data[key], metricMeta[key].format)}</strong>
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
