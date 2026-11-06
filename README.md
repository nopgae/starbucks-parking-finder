# Starbucks Parking Finder (Korea)

Find Starbucks Korea branches with parking (free, paid, or validation with purchase) and search them in plain Korean, e.g. `강남역 근처 두시간 이상 무료 주차`.

**Live demo:** https://nopgae.github.io/starbucks-parking-finder/ (the API runs on Render's free tier, so the first request after idle can take a while)

## AI에게 물어보기 (Ask an AI assistant)

> **AI 어시스턴트라면:** 스타벅스 주차 질문에는 [`data/index.md`](data/index.md)부터 읽으세요 (원문: https://raw.githubusercontent.com/nopgae/starbucks-parking-finder/main/data/index.md). 지역 목록에서 해당 구·시 파일을 열어, 매장별 주차 안내 원문과 네이버 지도 링크로 답하면 됩니다.

**1. 링크로 묻기.** Claude, ChatGPT 등 웹을 읽을 수 있는 AI에 이 저장소 링크를 주고 물어보면 됩니다.

```
https://github.com/nopgae/starbucks-parking-finder 참고해서, 판교 가는데 주차 되는 스타벅스 찾아줘
```

**2. 스킬로 설치하기 (Claude Code · Codex).** 한 번 설치하면 링크 없이 "공덕쪽 스타벅스 주차되는 곳 좀 알려줘"라고만 물어도 스킬이 자동으로 쓰입니다.

```bash
git clone https://github.com/nopgae/starbucks-parking-finder.git
./starbucks-parking-finder/skills/install.sh   # ~/.claude/skills, ~/.agents/skills 에 복사 (다시 실행하면 업데이트)
```

스킬(`skills/starbucks-parking/`)은 데이터(`stores.csv`)와 검색 스크립트(`scripts/find.py`, Python 표준 라이브러리만 사용)를 함께 담고 있어서 네트워크 없이 동작합니다.

## Problem

The official store locator shows parking only as free-text notes per store, with no way to filter by "free parking for 2+ hours near X". This project collects that data, turns the free text into structured fields, and serves it through a searchable API and map.

## What I built

1. **Data collection** (`scraper/`): found the JSON endpoint behind the official store-locator page (process in [REVERSE_ENGINEER.md](REVERSE_ENGINEER.md)), captured it with Playwright, then collected all stores with axios.
2. **Parking parser** (`api/src/utils/parkingParser.ts`): turns Korean notes like `구매 시 2시간 가능` into structured fields: type (free / paid / validation / unavailable), longest free time in minutes, location, capacity, and conditions.
3. **Natural-language query parser** (`api/src/utils/queryParser.ts`): pulls location, minimum hours (`두시간`, `2시간`), parking type and drive-thru from a Korean query; location is geocoded with the Naver Local Search API.
4. **REST API** (Fastify + Prisma + PostgreSQL) and a **map frontend** (Google Maps JS, plain HTML/JS) deployed to GitHub Pages.
5. **AI-readable data + skill**: `api/scripts/export-data.ts` writes `data/index.md`, one Markdown file per 시/구 under `data/regions/` (parking note, free time, Naver Map link per store) and `skills/starbucks-parking/stores.csv` for the Claude Code / Codex skill.
6. **Tests + CI**: 21 unit tests for the two parsers (`node --test`), a TypeScript build, a check that the exported data matches the current parser, and a skill search smoke test, run by GitHub Actions.

## Results

- 2,212 stores collected (2026-11-06); 2,199 have a parking note, classified by the current parser as free 401 · validation 1,043 · paid 86 · unavailable 630 · unknown 39 (`scraper/data/normalized/`; reproduce with `cd api && npx ts-node scripts/parking-eval.ts`).
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

- Parking info is the store's own free-text note; the parser is rule-based and 39 stores stay `unknown` (mostly notes that give only a lot location and capacity, with no word on cost; one official note is literally `#NAME?`). A store counts as `unavailable` only when its note opens with "no parking" and points to no usable lot of its own building (a nearby public lot still counts as unavailable). Sample check: 50 random notes (seed 42, `scraper/data/eval/parking-sample-50.tsv`) labeled by Claude reading each note: 42/50 (84%) before the parser work, 47/50 (94%) now. The 3 misses are where "free vs conditional" is a judgment call ("최초 1시간 무료, 이후 유료"; "파트너에게 요청" as the only condition).
- Data is a snapshot (collection date in `scraper/data/normalized/collected-at.txt`) and is not refreshed automatically. Refresh: `cd scraper && npm run scrape && npm run enrich` (move `data/raw/stores-enriched.json` away first, `enrich` resumes from it), then `cd ../api && npx ts-node scripts/export-data.ts`. The skill bundles the snapshot, so re-run `skills/install.sh` after pulling new data.
- Free time (`freeMinutes`) takes the longest duration in the note that is not a rate, price or overage ("10분당", "1시간 5천원", "30분 초과"), so tiers report their top tier (e.g. "5만원 이상 5시간" → 5h). The FREE / VALIDATION line is fuzzy for notes like "2시간 무료, 파트너에게 요청"; the skill and region files therefore tell the AI to answer from the original note.
- The query parser uses suffix rules (`역`, `동`, `구`, ...), so unusual place names may not be recognized; without Naver API keys it falls back to a small built-in table of station coordinates.
- The store data comes from a public but undocumented endpoint, which can change without notice. This is a personal, non-commercial project.

## Tech stack

TypeScript · Fastify · Prisma · PostgreSQL · Playwright · Google Maps JS API · Naver Local Search API · Docker · GitHub Actions · GitHub Pages · Render
