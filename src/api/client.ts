import { CountryMetricYear } from "../types/metrics";
import { getByYear, getSeries } from "../data/fakeData";

const delay = (min = 150, max = 400) => {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
};

type RawHappinessRow = {
  Country: string;
  ISO: string;
  [key: string]: string | number | null;
};

type RawInflationRow = {
  "Country Name": string;
  [key: string]: string | number | null;
};

type RawCpiRow = {
  year: number | string;
  country: string;
  score: number | string;
};

const RAW_HAPPINESS_PATH = "/data/raw/happiness_data.json";
const RAW_INFLATION_PATH = "/data/raw/inflation_data.json";
const RAW_CPI_PATH = "/data/raw/corruption_perception_index.json";
const HPI_PREFIX = "HPI_";

let happinessCache: RawHappinessRow[] | null = null;
let happinessLoadPromise: Promise<RawHappinessRow[]> | null = null;
let happinessYears: number[] | null = null;
let warnedHappiness = false;

let inflationCache: RawInflationRow[] | null = null;
let inflationLoadPromise: Promise<RawInflationRow[]> | null = null;
let inflationYears: number[] | null = null;
let inflationByCountry: Map<string, Map<number, number>> | null = null;
let warnedInflation = false;

let cpiCache: RawCpiRow[] | null = null;
let cpiLoadPromise: Promise<RawCpiRow[]> | null = null;
let cpiByYearCountry: Map<number, Map<string, number>> | null = null;
let cpiYears: number[] | null = null;
let warnedCpi = false;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const loadHappinessData = async () => {
  if (happinessCache) return happinessCache;
  if (!happinessLoadPromise) {
    happinessLoadPromise = fetch(RAW_HAPPINESS_PATH)
      .then((response) => response.json())
      .then((rows) => {
        happinessCache = rows as RawHappinessRow[];
        return happinessCache;
      });
  }
  return happinessLoadPromise;
};

const loadInflationData = async () => {
  if (inflationCache) return inflationCache;
  if (!inflationLoadPromise) {
    inflationLoadPromise = fetch(RAW_INFLATION_PATH)
      .then((response) => response.json())
      .then((rows) => {
        inflationCache = rows as RawInflationRow[];
        return inflationCache;
      });
  }
  return inflationLoadPromise;
};

const loadCpiData = async () => {
  if (cpiCache) return cpiCache;
  if (!cpiLoadPromise) {
    cpiLoadPromise = fetch(RAW_CPI_PATH)
      .then((response) => response.json())
      .then((rows) => {
        cpiCache = rows as RawCpiRow[];
        return cpiCache;
      });
  }
  return cpiLoadPromise;
};

const getHappinessYears = (rows: RawHappinessRow[]) => {
  if (happinessYears) return happinessYears;
  const sample = rows[0];
  if (!sample) {
    happinessYears = [];
    return happinessYears;
  }
  happinessYears = Object.keys(sample)
    .filter((key) => key.startsWith(HPI_PREFIX))
    .map((key) => Number(key.slice(HPI_PREFIX.length)))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);
  return happinessYears;
};

const getInflationYears = (rows: RawInflationRow[]) => {
  if (inflationYears) return inflationYears;
  const sample = rows[0];
  if (!sample) {
    inflationYears = [];
    return inflationYears;
  }
  inflationYears = Object.keys(sample)
    .map((key) => Number(key))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);
  return inflationYears;
};

const getCpiYears = (rows: RawCpiRow[]) => {
  if (cpiYears) return cpiYears;
  cpiYears = Array.from(
    new Set(
      rows
        .map((row) => Number(row.year))
        .filter((year) => Number.isFinite(year))
    )
  ).sort((a, b) => a - b);
  return cpiYears;
};

const getHappinessByIso = (rows: RawHappinessRow[]) => {
  const map = new Map<string, Map<number, number>>();
  const years = getHappinessYears(rows);
  rows.forEach((row) => {
    if (!row.ISO) return;
    const yearMap = new Map<number, number>();
    years.forEach((year) => {
      const value = row[`${HPI_PREFIX}${year}`];
      if (isFiniteNumber(value)) {
        yearMap.set(year, value);
      }
    });
    map.set(row.ISO, yearMap);
  });
  return map;
};

const getInflationByCountry = (rows: RawInflationRow[]) => {
  if (inflationByCountry) return inflationByCountry;
  inflationByCountry = new Map<string, Map<number, number>>();
  const years = getInflationYears(rows);
  rows.forEach((row) => {
    const name = row["Country Name"];
    if (!name) return;
    const yearMap = new Map<number, number>();
    years.forEach((year) => {
      const value = row[String(year)];
      const numeric = typeof value === "string" ? Number(value) : value;
      if (isFiniteNumber(numeric)) {
        yearMap.set(year, numeric);
      }
    });
    inflationByCountry!.set(name, yearMap);
  });
  return inflationByCountry;
};

const getCpiByYearCountry = (rows: RawCpiRow[]) => {
  if (cpiByYearCountry) return cpiByYearCountry;
  cpiByYearCountry = new Map<number, Map<string, number>>();
  rows.forEach((row) => {
    const year = Number(row.year);
    const score = typeof row.score === "string" ? Number(row.score) : row.score;
    if (!Number.isFinite(year) || !isFiniteNumber(score) || !row.country) {
      return;
    }
    if (!cpiByYearCountry!.has(year)) {
      cpiByYearCountry!.set(year, new Map());
    }
    cpiByYearCountry!.get(year)!.set(row.country, score);
  });
  return cpiByYearCountry;
};

const logHappinessSummary = (year: number, rows: RawHappinessRow[]) => {
  if (warnedHappiness) return;
  const key = `${HPI_PREFIX}${year}`;
  const loaded = rows.length;
  let usable = 0;
  const skipped: string[] = [];

  rows.forEach((row) => {
    const value = row[key];
    if (!row.ISO || !row.Country || !isFiniteNumber(value)) {
      if (skipped.length < 25) {
        skipped.push(row.ISO || row.Country || "Unknown");
      }
      return;
    }
    usable += 1;
  });

  const skippedCount = loaded - usable;
  const topSkipped = Array.from(new Set(skipped)).slice(0, 5).join(", ");
  console.warn(
    `[raw:happiness_data] HPI_${year}: loaded ${loaded}, usable ${usable}, skipped ${skippedCount}` +
      (topSkipped ? `; skipped: ${topSkipped}` : "")
  );
  warnedHappiness = true;
};

const logInflationSummary = (year: number, rows: RawInflationRow[]) => {
  if (warnedInflation) return;
  const loaded = rows.length;
  let usable = 0;
  const skipped: string[] = [];

  rows.forEach((row) => {
    const value = row[String(year)];
    const numeric = typeof value === "string" ? Number(value) : value;
    if (!row["Country Name"] || !isFiniteNumber(numeric)) {
      if (skipped.length < 25) {
        skipped.push(row["Country Name"] || "Unknown");
      }
      return;
    }
    usable += 1;
  });

  const skippedCount = loaded - usable;
  const topSkipped = Array.from(new Set(skipped)).slice(0, 5).join(", ");
  console.warn(
    `[raw:inflation_data] ${year}: loaded ${loaded}, usable ${usable}, skipped ${skippedCount}` +
      (topSkipped ? `; skipped: ${topSkipped}` : "")
  );
  warnedInflation = true;
};

const logCpiSummary = (year: number, rows: RawCpiRow[]) => {
  if (warnedCpi) return;
  const loaded = rows.length;
  let usable = 0;
  const skipped: string[] = [];

  rows.forEach((row) => {
    const rowYear = Number(row.year);
    const score = typeof row.score === "string" ? Number(row.score) : row.score;
    if (!Number.isFinite(rowYear) || !row.country || !isFiniteNumber(score) || rowYear !== year) {
      if (skipped.length < 25) {
        skipped.push(row.country || "Unknown");
      }
      return;
    }
    usable += 1;
  });

  const skippedCount = loaded - usable;
  const topSkipped = Array.from(new Set(skipped)).slice(0, 5).join(", ");
  console.warn(
    `[raw:corruption_perception_index] ${year}: loaded ${loaded}, usable ${usable}, skipped ${skippedCount}` +
      (topSkipped ? `; skipped: ${topSkipped}` : "")
  );
  warnedCpi = true;
};

const pickLogYear = (requested: number, available: number[]) => {
  if (available.length === 0) return requested;
  if (available.includes(requested)) return requested;
  return Math.max(...available);
};

// Future endpoints:
// GET /metrics?year=2025
export const getCountryYearMetrics = async (
  year: number
): Promise<CountryMetricYear[]> => {
  await delay();
  const baseRows = getByYear(year);
  try {
    const [happinessRows, inflationRows, cpiRows] = await Promise.all([
      loadHappinessData(),
      loadInflationData(),
      loadCpiData()
    ]);

    const happinessByIso = getHappinessByIso(happinessRows);
    const inflationByName = getInflationByCountry(inflationRows);
    const cpiByYear = getCpiByYearCountry(cpiRows);

    logHappinessSummary(pickLogYear(year, getHappinessYears(happinessRows)), happinessRows);
    logInflationSummary(pickLogYear(year, getInflationYears(inflationRows)), inflationRows);
    logCpiSummary(pickLogYear(year, getCpiYears(cpiRows)), cpiRows);

    return baseRows.map((row) => {
      const happinessValue = happinessByIso.get(row.iso3)?.get(year);
      const inflationValue = inflationByName.get(row.country)?.get(year);
      const cpiValue = cpiByYear.get(year)?.get(row.country);

      return {
        ...row,
        happiness: isFiniteNumber(happinessValue) ? happinessValue : row.happiness,
        inflation: isFiniteNumber(inflationValue) ? inflationValue : row.inflation,
        cpi: isFiniteNumber(cpiValue) ? cpiValue : row.cpi
      };
    });
  } catch (error) {
    console.warn("[raw:merge] Falling back to fake data for year metrics.", error);
    return baseRows;
  }
};

// Future endpoints:
// GET /country/{iso3}/series
export const getCountrySeries = async (
  iso3: string
): Promise<CountryMetricYear[]> => {
  await delay();
  const baseSeries = getSeries(iso3);
  if (baseSeries.length === 0) return [];
  try {
    const [happinessRows, inflationRows, cpiRows] = await Promise.all([
      loadHappinessData(),
      loadInflationData(),
      loadCpiData()
    ]);

    const happinessByIso = getHappinessByIso(happinessRows);
    const inflationByName = getInflationByCountry(inflationRows);
    const cpiByYear = getCpiByYearCountry(cpiRows);

    const logYear = pickLogYear(2025, getHappinessYears(happinessRows));
    logHappinessSummary(logYear, happinessRows);
    logInflationSummary(pickLogYear(2025, getInflationYears(inflationRows)), inflationRows);
    logCpiSummary(pickLogYear(2025, getCpiYears(cpiRows)), cpiRows);

    return baseSeries.map((row) => {
      const happinessValue = happinessByIso.get(row.iso3)?.get(row.year);
      const inflationValue = inflationByName.get(row.country)?.get(row.year);
      const cpiValue = cpiByYear.get(row.year)?.get(row.country);

      return {
        ...row,
        happiness: isFiniteNumber(happinessValue) ? happinessValue : row.happiness,
        inflation: isFiniteNumber(inflationValue) ? inflationValue : row.inflation,
        cpi: isFiniteNumber(cpiValue) ? cpiValue : row.cpi
      };
    });
  } catch (error) {
    console.warn("[raw:merge] Falling back to fake data for country series.", error);
    return baseSeries;
  }
};
