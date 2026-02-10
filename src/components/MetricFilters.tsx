import { MetricKey } from "../types/metrics";
import { metricMeta, metricOptions } from "../utils/metricMeta";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

type Props = {
  metric: MetricKey;
  year: number;
  normalizeSalary: boolean;
  onMetricChange: (metric: MetricKey) => void;
  onYearChange: (year: number) => void;
  onToggleNormalize: (value: boolean) => void;
};

const MetricFilters = ({
  metric,
  year,
  normalizeSalary,
  onMetricChange,
  onYearChange,
  onToggleNormalize
}: Props) => {
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
        <select
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
        >
          {YEARS.map((yr) => (
            <option key={yr} value={yr}>
              {yr}
            </option>
          ))}
        </select>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={normalizeSalary}
          onChange={(event) => onToggleNormalize(event.target.checked)}
          disabled={metric !== "avg_salary_usd"}
        />
        <span>Normalize salary by inflation</span>
      </label>
      <div className="hint">
        {metric === "avg_salary_usd"
          ? "Toggle to view inflation-adjusted (real) salary values."
          : "Normalization only applies to salary."}
      </div>
    </section>
  );
};

export default MetricFilters;
