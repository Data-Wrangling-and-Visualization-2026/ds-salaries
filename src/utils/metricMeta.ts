import { MetricKey } from "../types/metrics";
import { formatCurrency, formatNumber } from "./format";

export type MetricMeta = {
  key: MetricKey;
  label: string;
  unit: string;
  isPositive: boolean;
  format: (value: number) => string;
  accessor: (row: Record<string, number>) => number;
};

export const metricMeta: Record<MetricKey, MetricMeta> = {
  salary: {
    key: "salary",
    label: "Median Salary",
    unit: "USD",
    isPositive: true,
    format: (v) => formatCurrency(v, 0),
    accessor: (row) => row.salary
  },
  count: {
    key: "count",
    label: "Job Count",
    unit: "records",
    isPositive: true,
    format: (v) => formatNumber(v, 0),
    accessor: (row) => row.count
  }
};

export const metricOptions: MetricKey[] = ["salary", "count"];
