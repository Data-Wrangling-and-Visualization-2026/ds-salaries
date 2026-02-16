import { MetricKey } from "../types/metrics";
import { formatCurrency, formatPercent, formatScore } from "./format";

export type MetricMeta = {
  key: MetricKey;
  label: string;
  unit: string;
  isPositive: boolean;
  format: (value: number) => string;
  accessor: (row: Record<string, number>) => number;
};

export const metricMeta: Record<MetricKey, MetricMeta> = {
  avg_salary_usd: {
    key: "avg_salary_usd",
    label: "Average Salary",
    unit: "USD",
    isPositive: true,
    format: (v) => formatCurrency(v, 0),
    accessor: (row) => row.avg_salary_usd
  },
  inflation: {
    key: "inflation",
    label: "Inflation",
    unit: "%",
    isPositive: false,
    format: (v) => formatPercent(v, 1),
    accessor: (row) => row.inflation
  },
  unemployment: {
    key: "unemployment",
    label: "Unemployment",
    unit: "%",
    isPositive: false,
    format: (v) => formatPercent(v, 1),
    accessor: (row) => row.unemployment
  },
  cpi: {
    key: "cpi",
    label: "Corruption Perceptions Index",
    unit: "0-100",
    isPositive: true,
    format: (v) => formatScore(v, 0),
    accessor: (row) => row.cpi
  },
  happiness: {
    key: "happiness",
    label: "Happy Planet Index (HPI)",
    unit: "0-100",
    isPositive: true,
    format: (v) => formatScore(v, 1),
    accessor: (row) => row.happiness
  },
  composite_score: {
    key: "composite_score",
    label: "Composite Score",
    unit: "0-100",
    isPositive: true,
    format: (v) => formatScore(v, 1),
    accessor: (row) => row.composite_score
  }
};

export const metricOptions: MetricKey[] = [
  "avg_salary_usd",
  "happiness",
  "inflation",
  "unemployment",
  "cpi",
  "composite_score"
];
