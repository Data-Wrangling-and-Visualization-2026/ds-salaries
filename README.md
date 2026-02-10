# DS Careers Atlas — Sprint 2 Prototype

Prototype for “Data Science Careers Across Countries: Salary, Well-Being, and Reality.”

## Run

```bash
npm install
npm run dev
```

## What’s in Sprint 2

- Interactive home view with a world choropleth map (D3 + SVG)
- Hover tooltips, click-to-select, side panel with key metrics
- Country page with 2020–2025 trend charts (D3 line + multi-line)
- Fake but deterministic data generation for 30 countries
- Simple API layer that simulates FastAPI latency

## Data

- Fake generator: `src/data/fakeData.ts`
- Countries list: `src/data/countries.ts`
- Exports:
  - `allMetrics`
  - `getByYear(year)`
  - `getSeries(iso3)`

Data is deterministic using a seeded random generator (iso3 + year).

## API Layer (ready for FastAPI)

- `src/api/client.ts`
- Current methods:
  - `getCountryYearMetrics(year)`
  - `getCountrySeries(iso3)`
- Simulates network latency with a 150–400ms delay

Future endpoints to replace:
- `GET /metrics?year=2025`
- `GET /country/{iso3}/series`

## Map Notes

The map uses a local GeoJSON file: `public/world.geojson`.

For Sprint 2, it contains simplified bounding boxes for 30 countries. This keeps the ISO_A3 mapping stable without external dependencies. Replace with a full Natural Earth GeoJSON (ISO_A3) in Sprint 3.

## Sprint 3 TODO

1. Connect real FastAPI endpoints + caching
2. Improve normalization (real vs nominal salary) and add CPI-based adjustments
3. Enhance legend + percentile bands
4. Add country search and Top-N ranking list
5. Expand world geometry with full ISO_A3 coverage
