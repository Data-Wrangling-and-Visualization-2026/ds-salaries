import { CountryMetricYear } from "../types/metrics";
import { getByYear, getSeries } from "../data/fakeData";

const delay = (min = 150, max = 400) => {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Future endpoints:
// GET /metrics?year=2025
export const getCountryYearMetrics = async (
  year: number
): Promise<CountryMetricYear[]> => {
  await delay();
  return getByYear(year);
};

// Future endpoints:
// GET /country/{iso3}/series
export const getCountrySeries = async (
  iso3: string
): Promise<CountryMetricYear[]> => {
  await delay();
  return getSeries(iso3);
};
