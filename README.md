# DS Careers Atlas — Sprint 3 Prototype

Prototype for “Data Science Careers Across Countries: Salary, Well-Being, and Reality.”

## Run

```bash
npm install
npm run dev
```

## What’s in Sprint 2 (Historical)

- Interactive home view with a world choropleth map (D3 + SVG)
- Hover tooltips, click-to-select, side panel with key metrics
- Country page with 2020–2025 trend charts (D3 line + multi-line)
- Fake but deterministic data generation for 30 countries
- Simple API layer that simulates FastAPI latency

Note: Sprint 2 artifacts were removed/replaced in Sprint 3 as the real API and datasets landed.

## Data (Sprint 2 Historical)

- Fake generator: `src/data/fakeData.ts`
- Countries list: `src/data/countries.ts`
- Exports:
  - `allMetrics`
  - `getByYear(year)`
  - `getSeries(iso3)`

Data is deterministic using a seeded random generator (iso3 + year).

Note: These files were removed in Sprint 3 after the real backend/data were introduced.

## API Layer (Sprint 2 Historical)

- `src/api/client.ts`
- Current methods:
  - `getCountryYearMetrics(year)`
  - `getCountrySeries(iso3)`
- Simulates network latency with a 150–400ms delay

Future endpoints to replace:
- `GET /metrics?year=2025`
- `GET /country/{iso3}/series`

## Map Notes (Sprint 2 Historical)

The map uses a local GeoJSON file: `public/world.geojson`.

For Sprint 2, it contains simplified bounding boxes for 30 countries. This keeps the ISO_A3 mapping stable without external dependencies. Replace with a full Natural Earth GeoJSON (ISO_A3) in Sprint 3.

## Sprint 3 (Weeks 5–6) — Clean Data & API Contract

Sprint 3 focuses on cleaning data, locking the API contract, and wiring the frontend to real backend endpoints with a production-ready map and UX.

## Sprint 3 TODO
1. Add `/metrics?year=` server-side filtering + pagination
2. Add API endpoints for available years/countries
3. Improve normalization and add CPI adjustments
4. Add country search and Top‑N ranking list
5. Add lightweight API tests + smoke tests for the UI

### What’s delivered in Sprint 3

- **Backend API (FastAPI)**
  - `GET /metrics` returns all country-year rows.
  - `GET /countries/{iso3}/series` returns a single country series.
  - Pydantic schemas for `iso3`, `country`, `year`, `salary`, `count`.
  - CORS enabled for local frontend dev.

- **Frontend**
  - Real HTTP client with typed responses and error handling.
  - HPI-style world map with discrete bins, white borders, compact `BAD → GOOD` legend, and `No data` gray.
  - Country page and side panel wired to real salary/count metrics.

- **Data**
  - Preprocessed datasets for salaries, inflation, unemployment, and HPI sources added under `data/preprocessed`.
  - Backend reads `backend/data/DataScience_salaries_2025_clean.json` (2020–2025).

### Sprint 3 workstreams

| Трек | Участник A | Участник B | Участник C |
| --- | --- | --- | --- |
| **Data** | Clean pipeline, AI-нормализация, EDA | Помощь с валидацией | Фидбек под нужды viz |
| **Backend** | Согласование схем | Реальные endpoints, фиксация JSON-схем | Тестирование API |
| **Frontend** | Фидбек по данным | Фидбек по API | Подключение API, базовый интерактив |
| **Общее** | Совместный пересмотр данных | Совместный пересмотр API | Совместный пересмотр UX |

### How to run (Sprint 3)

Backend:
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:
```bash
npm install
npm run dev
```

Optional env:
```
VITE_API_BASE_URL=http://localhost:8000
```

## Sprint 4 TODO
1. Stabilize data pipeline and finalize AI documentation
2. Validate reproducibility across environments
3. Confirm dataset readiness for visualization needs
4. Ship stable API with minimal deploy target
5. Add integration tests for API and frontend
6. Deliver skeleton web app with a working hero visualization
7. Prepare demo assets and narrative
