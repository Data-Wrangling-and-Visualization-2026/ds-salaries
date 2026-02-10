export type MetricKey =
  | "avg_salary_usd"
  | "inflation"
  | "unemployment"
  | "cpi"
  | "happiness"
  | "composite_score";

export type CountryMetricYear = {
  iso3: string;
  country: string;
  year: number;
  avg_salary_usd: number;
  inflation: number;
  unemployment: number;
  cpi: number;
  happiness: number;
  composite_score: number;
};
