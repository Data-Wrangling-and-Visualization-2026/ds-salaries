import { CountryMetricYear } from "../types/metrics";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  .replace(/\/+$/, "");

const requestJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const detail = await response.text();
    const message = detail
      ? `Request failed (${response.status}): ${detail}`
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return (await response.json()) as T;
};

type MetricsResponse = { data: CountryMetricYear[] };

type GeoFeature = {
  type: "Feature";
  properties?: { ISO_A3?: string; ADMIN?: string };
};

type GeoFeatureCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

let metricsCache: CountryMetricYear[] | null = null;
let metricsPromise: Promise<CountryMetricYear[]> | null = null;

let countryNameCache: Map<string, string> | null = null;
let countryNamePromise: Promise<Map<string, string>> | null = null;

const loadCountryNames = async () => {
  if (countryNameCache) return countryNameCache;
  if (!countryNamePromise) {
    countryNamePromise = fetch("/world.geojson")
      .then((response) => response.json())
      .then((json) => {
        const collection = json as GeoFeatureCollection;
        const map = new Map<string, string>();
        collection.features.forEach((feature) => {
          const iso = feature.properties?.ISO_A3;
          const name = feature.properties?.ADMIN;
          if (iso && name) {
            map.set(iso, name);
          }
        });
        countryNameCache = map;
        return map;
      })
      .catch(() => {
        countryNameCache = new Map();
        return countryNameCache;
      });
  }
  return countryNamePromise;
};

const applyCountryNames = async (rows: CountryMetricYear[]) => {
  const names = await loadCountryNames();
  return rows.map((row) => ({
    ...row,
    country: names.get(row.iso3) || row.country || row.iso3
  }));
};

const loadAllMetrics = async () => {
  if (metricsCache) return metricsCache;
  if (!metricsPromise) {
    metricsPromise = requestJson<MetricsResponse>("/metrics").then(async (response) => {
      const rows = response.data ?? [];
      const withNames = await applyCountryNames(rows);
      metricsCache = withNames;
      return withNames;
    });
  }
  return metricsPromise;
};

export const getCountryYearMetrics = async (year: number) => {
  const rows = await loadAllMetrics();
  return rows.filter((row) => row.year === year);
};

export const getAvailableYears = async () => {
  const rows = await loadAllMetrics();
  return Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => a - b);
};

export const getAvailableYearsForMetric = async (metric: keyof CountryMetricYear) => {
  const rows = await loadAllMetrics();
  return Array.from(
    new Set(
      rows
        .filter((row) => {
          const v = row[metric];
          return v != null && Number.isFinite(v as number) && (v as number) > 0;
        })
        .map((row) => row.year)
    )
  ).sort((a, b) => a - b);
};

export type USAProfession = {
  job_title: string;
  count: number;
  median_salary: number;
};

export type USAExperienceLevel = {
  experience_level: string;
  count: number;
  median_salary: number;
};

export const getUSAProfessions = async (): Promise<USAProfession[]> => {
  const response = await requestJson<{ data: USAProfession[] }>("/usa/professions");
  return response.data ?? [];
};

export const getUSAExperience = async (): Promise<USAExperienceLevel[]> => {
  const response = await requestJson<{ data: USAExperienceLevel[] }>("/usa/experience");
  return response.data ?? [];
};

export const getCountrySeries = async (iso3: string) => {
  const response = await requestJson<MetricsResponse>(`/countries/${iso3}/series`);
  const rows = await applyCountryNames(response.data ?? []);
  return rows.sort((a, b) => a.year - b.year);
};
