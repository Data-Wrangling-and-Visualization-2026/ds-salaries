import { countries } from "./countries";
import { CountryMetricYear } from "../types/metrics";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const xmur3 = (str: string) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};

const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rngFromString = (seed: string) => {
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
};

const baseByCountry = countries.map((c) => {
  const rng = rngFromString(c.iso3);
  const salaryBase = 40000 + rng() * 120000;
  const inflationBase = 1 + rng() * 8;
  const unemploymentBase = 3 + rng() * 8;
  const cpiBase = 25 + rng() * 60;
  const happinessBase = 4.5 + rng() * 3.5;
  const salaryTrend = -0.01 + rng() * 0.05;
  const inflationTrend = -0.2 + rng() * 0.6;
  const unemploymentTrend = -0.2 + rng() * 0.6;
  const cpiTrend = -0.1 + rng() * 0.4;
  const happinessTrend = -0.05 + rng() * 0.2;

  return {
    ...c,
    salaryBase,
    inflationBase,
    unemploymentBase,
    cpiBase,
    happinessBase,
    salaryTrend,
    inflationTrend,
    unemploymentTrend,
    cpiTrend,
    happinessTrend
  };
});

const computeComposite = (row: CountryMetricYear) => {
  const salaryNorm = clamp((row.avg_salary_usd - 40000) / 140000, 0, 1);
  const happinessNorm = clamp(row.happiness / 10, 0, 1);
  const cpiNorm = clamp(row.cpi / 100, 0, 1);
  const inflationNorm = clamp((15 - row.inflation) / 15, 0, 1);
  const unemploymentNorm = clamp((15 - row.unemployment) / 15, 0, 1);

  const score =
    100 *
    (0.35 * salaryNorm +
      0.2 * happinessNorm +
      0.15 * cpiNorm +
      0.15 * inflationNorm +
      0.15 * unemploymentNorm);

  return clamp(score, 0, 100);
};

export const allMetrics: CountryMetricYear[] = baseByCountry.flatMap((base) => {
  return YEARS.map((year) => {
    const yearOffset = year - 2020;
    const rng = rngFromString(`${base.iso3}-${year}`);
    const salaryNoise = 0.92 + rng() * 0.16;
    const inflationNoise = -1.2 + rng() * 2.4;
    const unemploymentNoise = -1 + rng() * 2;
    const cpiNoise = -3 + rng() * 6;
    const happinessNoise = -0.3 + rng() * 0.6;

    const avg_salary_usd = clamp(
      base.salaryBase * (1 + base.salaryTrend * yearOffset) * salaryNoise,
      30000,
      190000
    );

    const inflation = clamp(
      base.inflationBase + base.inflationTrend * yearOffset + inflationNoise,
      0.4,
      15
    );

    const unemployment = clamp(
      base.unemploymentBase + base.unemploymentTrend * yearOffset + unemploymentNoise,
      2,
      18
    );

    const cpi = clamp(
      base.cpiBase + base.cpiTrend * yearOffset + cpiNoise,
      20,
      90
    );

    const happiness = clamp(
      base.happinessBase + base.happinessTrend * yearOffset + happinessNoise,
      3.8,
      8.8
    );

    const row: CountryMetricYear = {
      iso3: base.iso3,
      country: base.country,
      year,
      avg_salary_usd: Number(avg_salary_usd.toFixed(0)),
      inflation: Number(inflation.toFixed(1)),
      unemployment: Number(unemployment.toFixed(1)),
      cpi: Number(cpi.toFixed(0)),
      happiness: Number(happiness.toFixed(1)),
      composite_score: 0
    };

    row.composite_score = Number(computeComposite(row).toFixed(1));
    return row;
  });
});

export const getByYear = (year: number) =>
  allMetrics.filter((row) => row.year === year);

export const getSeries = (iso3: string) =>
  allMetrics.filter((row) => row.iso3 === iso3).sort((a, b) => a.year - b.year);
