import { MetricKey } from "../types/metrics";
import { metricMeta, metricOptions } from "../utils/metricMeta";

type Props = {
  metric: MetricKey;
  year: number;
  years: number[];
  onMetricChange: (metric: MetricKey) => void;
  onYearChange: (year: number) => void;
};

const MetricFilters = ({ metric, year, years, onMetricChange, onYearChange }: Props) => {
  const yearOptions = years.length > 0 ? years : [year];

  return (
    <section className="panel filters">
      <h2>Filters</h2>
      <label className="field">
        <span>Metric</span>
        <select
          value={metric}
          onChange={(event) => onMetricChange(event.target.value as MetricKey)}
        >
          {metricOptions.map((key) => (
            <option key={key} value={key}>
              {metricMeta[key].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Year</span>
        <select value={year} onChange={(event) => onYearChange(Number(event.target.value))}>
          {yearOptions.map((yr) => (
            <option key={yr} value={yr}>
              {yr}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
};

export default MetricFilters;
