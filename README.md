# Starbucks Parking Finder (Korea)

Find Starbucks Korea branches with parking (free, paid, or validation with purchase) and search them in plain Korean, e.g. `강남역 근처 두시간 이상 무료 주차`.

**Live demo:** https://nopgae.github.io/starbucks-parking-finder/ (the API runs on Render's free tier, so the first request after idle can take a while)

## Problem

The official store locator shows parking only as free-text notes per store, with no way to filter by "free parking for 2+ hours near X". This project collects that data, turns the free text into structured fields, and serves it through a searchable API and map.

## What I built

1. **Data collection** (`scraper/`): found the JSON endpoint behind the official store-locator page (process in [REVERSE_ENGINEER.md](REVERSE_ENGINEER.md)), captured it with Playwright, then collected all stores with axios.
2. **Parking parser** (`api/src/utils/parkingParser.ts`): turns Korean notes like `구매 시 2시간 가능` into structured fields: type (free / paid / validation / unavailable), location, capacity, and conditions.
3. **Natural-language query parser** (`api/src/utils/queryParser.ts`): pulls location, minimum hours (`두시간`, `2시간`), parking type and drive-thru from a Korean query; location is geocoded with the Naver Local Search API.
4. **REST API** (Fastify + Prisma + PostgreSQL) and a **map frontend** (Google Maps JS, plain HTML/JS) deployed to GitHub Pages.
5. **Tests + CI**: 11 unit tests for the two parsers (`node --test`), run with a TypeScript build by GitHub Actions on every push to `api/`.

## Results

- 2,131 stores collected; 1,514 have parking info, classified as free 1,220 · validation 113 · paid 68 · unknown 113 (`scraper/data/normalized/`).
- Deployed end-to-end: GitHub Pages frontend → Render API → PostgreSQL.

## API

| Endpoint | Description |
|---|---|
| `GET /stores?sido=&gugun=&parking=&drive_thru=` | Filter stores by region / parking |
| `GET /stores/nearby?lat=&lng=&radius=` | Stores near a point |
| `GET /stores/:id` | Store detail |
| `POST /stores/:id/report` | User parking report |
| `POST /search` `{ "query": "...", "radius": 3, "limit": 10 }` | Natural-language search |
| `GET /health` | Health check |

## Run locally

```bash
# API + Postgres
# api/.env: DATABASE_URL, plus optional NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET
docker compose up -d postgres
cd api && npm ci && npx prisma migrate dev && npm run dev

# Tests (no DB or network needed)
cd api && npm test

# Frontend
cp frontend/config.js.example frontend/config.js   # add your Google Maps key
open frontend/index.html
```

`npm run db:seed` reads `scraper/data/raw/stores-enriched.json`, which is gitignored (large). Regenerate it with `cd scraper && npm ci && npm run scrape && npm run enrich`.

## Limitations

- Parking info is the store's own free-text note; the parser is rule-based and 113 stores stay `unknown`. Accuracy was not checked against a hand-labeled sample.
- Data is a one-time snapshot (April 2026) and is not refreshed automatically.
- The query parser uses suffix rules (`역`, `동`, `구`, ...), so unusual place names may not be recognized; without Naver API keys it falls back to a small built-in table of station coordinates.
- The store data comes from a public but undocumented endpoint, which can change without notice. This is a personal, non-commercial project.

## Tech stack

TypeScript · Fastify · Prisma · PostgreSQL · Playwright · Google Maps JS API · Naver Local Search API · Docker · GitHub Actions · GitHub Pages · Render
