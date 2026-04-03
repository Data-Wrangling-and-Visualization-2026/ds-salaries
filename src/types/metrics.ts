export type MetricKey = "salary" | "count" | "happiness" | "inflation" | "unemployment" | "corruption";

export type CountryMetricYear = {
  iso3: string;
  country: string;
  year: number;
  salary: number;
  count: number;
  happiness?: number | null;
  inflation?: number | null;
  unemployment?: number | null;
  corruption?: number | null;
};
