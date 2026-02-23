export type MetricKey = "salary" | "count";

export type CountryMetricYear = {
  iso3: string;
  country: string;
  year: number;
  salary: number;
  count: number;
};
