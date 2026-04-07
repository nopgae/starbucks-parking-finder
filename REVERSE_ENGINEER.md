# Reverse Engineering Starbucks Korea Store Locator API

## Goal
Intercept and document the hidden API that powers `starbucks.co.kr/store/store_map.do`,
specifically to extract store locations and parking information programmatically.

---

## Phase 1 — Manual Interception (Do This First)

Before writing any code, we need to identify the actual endpoint manually.

### Steps
1. Open `https://www.starbucks.co.kr/store/store_map.do` in Chrome
2. Open DevTools (`F12`) → **Network** tab
3. Check **Preserve log**, filter by **Fetch/XHR**
4. Interact with the map:
   - Move/zoom the map
   - Select a province (시/도) from the dropdown
   - Select a district (구/군)
   - Click on a store marker
5. For each network request captured, record:
   - Full URL + method (GET/POST)
   - Request headers (especially `Cookie`, `Referer`, `Content-Type`)
   - Request body/params
   - Response structure (JSON shape)

### What to Look For
| Signal | Meaning |
|---|---|
| Request to `/store/*.do` | Likely the store list or detail endpoint |
| Response contains `lat`, `lng`, or `xCoord` | Store location data |
| Response contains `주차` or `parkYn` or `parkInfo` | Parking data |
| Cookies sent with request | Session/auth requirement |

---

## Phase 2 — Analyze the Response Schema

Once the endpoint is found, map out the full response shape.

### Expected Fields to Document
```
Store
  - storeCode / storeId
  - storeName (Korean + English?)
  - address
  - lat / lng (or Kakao map coords)
  - phoneNumber
  - businessHours

Parking (what we care most about)
  - parkYn         → Y/N does this store have parking?
  - parkType       → free / paid / validation
  - parkFee        → price per hour or flat rate
  - parkHours      → max free hours, or operating hours
  - parkCondition  → "free with purchase", "stamp required", etc.
  - parkNote       → any extra notes
```

### Questions to Answer
- [ ] Is parking data returned in the store list call, or a separate detail call?
- [ ] Are Kakao map coordinates used instead of standard lat/lng?
- [ ] Does the endpoint require authentication (login session)?
- [ ] Is there pagination? What's the max results per call?
- [ ] Can you query by lat/lng + radius, or only by region (sido/gugun)?

---

## Phase 3 — Session & Auth Analysis

Starbucks Korea may require a valid browser session to return data.

### Check for:
- **CSRF tokens** — form hidden fields or headers like `X-CSRF-Token`
- **Session cookies** — `JSESSIONID` or similar; does it expire quickly?
- **Referer header enforcement** — does the API reject requests without `Referer: starbucks.co.kr`?
- **User-Agent enforcement** — does it block non-browser UAs?

### Reproduce with curl first:
```bash
# Test if endpoint works without auth
curl -X POST "https://www.starbucks.co.kr/[discovered-endpoint]" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Referer: https://www.starbucks.co.kr/store/store_map.do" \
  -d "sido=서울&gugun=강남구"

# Test with session cookie if above fails
curl -X POST "https://www.starbucks.co.kr/[discovered-endpoint]" \
  -H "Cookie: JSESSIONID=[copied-from-browser]" \
  -H "Referer: https://www.starbucks.co.kr/store/store_map.do" \
  -d "sido=서울&gugun=강남구"
```

---

## Phase 4 — Build the Scraper CLI

Once Phase 1–3 are confirmed, build a TypeScript CLI tool.

### Tool: Playwright-based interceptor

Use **Playwright** to automate the browser and intercept all network calls.
This bypasses auth/session issues since the real browser handles it.

```
CLI Flow:
  launch headless Chromium
    → navigate to store_map.do
    → intercept all XHR/fetch calls
    → iterate over all sido/gugun combinations
    → collect raw API responses
    → parse + normalize store + parking data
    → output to stores.json / seed DB
```

### Why Playwright over direct HTTP:
- Handles session cookies automatically
- Executes the JS that loads the map and triggers API calls
- Can handle dynamic parameters (Kakao map bounds, etc.)
- More resilient to anti-scraping measures

### Fallback: Direct HTTP (if no auth needed)
If Phase 3 shows the endpoint works without auth, skip Playwright and use
`axios` + direct POST calls — much faster for bulk collection.

---

## Phase 5 — Data Normalization & Storage

After collection, normalize into a clean schema for the parking finder service.

```
Raw Starbucks API response
  → parse Korean region codes
  → convert Kakao coords to standard lat/lng (if needed)
  → map parkYn/parkType to our schema
  → deduplicate by storeCode
  → insert into PostgreSQL via Prisma seed script
```

### Output Files
- `data/raw/stores-raw.json` — untouched API responses
- `data/normalized/stores.json` — cleaned, ready to seed
- `data/normalized/parking.json` — parking records linked to store IDs

---

## Phase 6 — Maintenance Strategy

Store data changes. Plan for keeping it fresh.

| Change Type | Frequency | Strategy |
|---|---|---|
| New store opened | Monthly | Re-run scraper, upsert by storeCode |
| Parking policy changed | Irregular | User report → admin review → update |
| Store closed | Occasional | Re-run scraper, mark as inactive |
| Parking data missing | At launch | Manual research per branch |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Starbucks Korea blocks scraper | Use Playwright with realistic delays + User-Agent |
| Parking data not in API | Fall back to manual curation for phase 1 launch |
| Kakao coord system differs from WGS84 | Use Kakao's coord conversion API |
| API structure changes | Store raw responses, re-parse without re-scraping |
| No parking data at all in API | Use Kakao Places parking attribute as supplement |

---

## Decision Gate

After Phase 1 (manual interception), decide:

```
Parking data found in API?
  YES → proceed with scraper (Phase 4)
  NO  → manual curation for MVP, scraper only for branch locations
```

This decision affects the entire data strategy — do Phase 1 before writing any code.
