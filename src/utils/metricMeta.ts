import { MetricKey } from "../types/metrics";
import { formatCurrency, formatNumber, formatPercent, formatScore } from "./format";

export type MetricMeta = {
  key: MetricKey;
  label: string;
  unit: string;
  isPositive: boolean;
  format: (value: number) => string;
  accessor: (row: Record<string, unknown>) => number | null | undefined;
};

export const metricMeta: Record<MetricKey, MetricMeta> = {
  salary: {
    key: "salary",
    label: "Median Salary",
    unit: "USD",
    isPositive: true,
    format: (v) => formatCurrency(v, 0),
    accessor: (row) => row.salary as number
  },
  count: {
    key: "count",
    label: "Job Count",
    unit: "records",
    isPositive: true,
    format: (v) => formatNumber(v, 0),
    accessor: (row) => row.count as number
  },
  happiness: {
    key: "happiness",
    label: "Happiness Index",
    unit: "score",
    isPositive: true,
    format: (v) => formatScore(v, 2),
    accessor: (row) => row.happiness as number | null | undefined
  },
  inflation: {
    key: "inflation",
    label: "Inflation Rate",
    unit: "%",
    isPositive: false,
    format: (v) => formatPercent(v, 1),
    accessor: (row) => row.inflation as number | null | undefined
  },
  unemployment: {
    key: "unemployment",
    label: "Unemployment Rate",
    unit: "%",
    isPositive: false,
    format: (v) => formatPercent(v, 1),
    accessor: (row) => row.unemployment as number | null | undefined
  },
  corruption: {
    key: "corruption",
    label: "Corruption Index",
    unit: "score",
    isPositive: true,
    format: (v) => formatScore(v, 0),
    accessor: (row) => row.corruption as number | null | undefined
  }
};

export const metricOptions: MetricKey[] = [
  "salary",
  "count",
  "happiness",
  "inflation",
  "unemployment",
  "corruption"
];
