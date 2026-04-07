/**
 * Phase 2: Enrich raw store data with park_info from getStoreView.do
 * Reads data/raw/stores-raw.json, calls getStoreView.do for each store,
 * saves enriched result to data/raw/stores-enriched.json
 */

import axios from "axios";
import fs from "fs";
import path from "path";

const BASE = "https://www.starbucks.co.kr";
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://www.starbucks.co.kr/store/store_map.do",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const RAW_DIR = path.resolve(__dirname, "../data/raw");
const NORM_DIR = path.resolve(__dirname, "../data/normalized");

// Parking availability patterns (Korean)
const NO_PARKING_PATTERNS = [
  "주차 불가",
  "주차불가",
  "주차가 불가",
  "주차 공간 없음",
];

function isParkingAvailable(parkInfo: string | null): boolean {
  if (!parkInfo || parkInfo.trim() === "") return false;
  return !NO_PARKING_PATTERNS.some((p) => parkInfo.includes(p));
}

// Extract parking type from park_info text
function parseParkingType(parkInfo: string | null): "free" | "paid" | "validation" | "unavailable" | "unknown" {
  if (!parkInfo) return "unknown";
  if (!isParkingAvailable(parkInfo)) return "unavailable";

  const text = parkInfo;
  // 무료 = free
  if (text.includes("무료") && !text.includes("유료")) return "free";
  // 유료 = paid
  if (text.includes("유료") && !text.includes("무료")) return "paid";
  // 구매 시 / 영수증 / 스탬프 = validation (free with purchase)
  if (
    text.includes("구매 시") ||
    text.includes("구매시") ||
    text.includes("영수증") ||
    text.includes("스탬프") ||
    text.includes("이용 시") ||
    text.includes("이용시")
  )
    return "validation";
  // Both or ambiguous
  if (text.includes("무료") && text.includes("유료")) return "validation";

  return "unknown";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStoreView(bizCd: string): Promise<{ park_info: string | null; notice: string | null }> {
  const params = new URLSearchParams({ in_biz_cd: bizCd });
  const res = await axios.post(`${BASE}/store/getStoreView.do`, params.toString(), {
    headers: HEADERS,
    timeout: 8000,
  });
  const view = res.data.view ?? [];
  if (view.length === 0) return { park_info: null, notice: null };
  return {
    park_info: view[0].park_info ?? null,
    notice: view[0].notice ?? null,
  };
}

async function run() {
  const rawPath = path.join(RAW_DIR, "stores-raw.json");
  const enrichedPath = path.join(RAW_DIR, "stores-enriched.json");
  const normPath = path.join(NORM_DIR, "stores-parking.json");

  if (!fs.existsSync(rawPath)) {
    console.error("[ERROR] stores-raw.json not found — run npm run scrape first");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  console.log(`[INFO] Loaded ${raw.length} stores from stores-raw.json`);

  // Resume support: load partially enriched file if it exists
  let enriched: Record<string, unknown>[] = [];
  const enrichedCodes = new Set<string>();
  if (fs.existsSync(enrichedPath)) {
    enriched = JSON.parse(fs.readFileSync(enrichedPath, "utf-8"));
    enriched.forEach((s: Record<string, unknown>) => enrichedCodes.add(s.s_biz_code as string));
    console.log(`[INFO] Resuming — ${enriched.length} stores already enriched`);
  }

  const remaining = raw.filter((s: Record<string, unknown>) => !enrichedCodes.has(s.s_biz_code as string));
  console.log(`[INFO] ${remaining.length} stores to enrich\n`);

  let done = 0;
  let errors = 0;

  for (const store of remaining) {
    const bizCd = store.s_biz_code as string;
    if (!bizCd) {
      enriched.push({ ...store, park_info: null, notice: null });
      continue;
    }

    try {
      const detail = await fetchStoreView(bizCd);
      enriched.push({ ...store, park_info: detail.park_info, notice: detail.notice });
      done++;

      if (done % 50 === 0) {
        // Save checkpoint every 50 stores
        fs.writeFileSync(enrichedPath, JSON.stringify(enriched, null, 2), "utf-8");
        console.log(`  [checkpoint] ${done + enrichedCodes.size}/${raw.length} done`);
      }
    } catch (err) {
      errors++;
      console.log(`  [WARN] Failed for ${store.s_name} (${bizCd}): ${(err as Error).message}`);
      enriched.push({ ...store, park_info: null, notice: null });
    }

    await sleep(120); // ~120ms between requests
  }

  // Final save
  fs.writeFileSync(enrichedPath, JSON.stringify(enriched, null, 2), "utf-8");
  console.log(`\n[DONE] Enriched ${enriched.length} stores → ${enrichedPath}`);
  console.log(`       Errors: ${errors}`);

  // Build parking-specific normalized output
  const parking = enriched
    .filter((s: Record<string, unknown>) => isParkingAvailable(s.park_info as string | null))
    .map((s: Record<string, unknown>) => ({
      storeCode: s.s_code,
      bizCode: s.s_biz_code,
      name: s.s_name,
      address: s.addr,
      roadAddress: s.doro_address,
      lat: parseFloat(s.lat as string) || 0,
      lng: parseFloat(s.lot as string) || 0,
      sido: s.sido_name,
      gugun: s.gugun_name,
      phone: s.tel,
      parking: {
        type: parseParkingType(s.park_info as string | null),
        info: s.park_info,
      },
      notice: s.notice,
      themeState: s.theme_state,
    }));

  fs.mkdirSync(NORM_DIR, { recursive: true });
  fs.writeFileSync(normPath, JSON.stringify(parking, null, 2), "utf-8");

  const typeCount = parking.reduce(
    (acc, s) => {
      acc[s.parking.type] = (acc[s.parking.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log(`\n[STATS] Stores with parking available: ${parking.length}`);
  console.log("        By type:", typeCount);
  console.log(`        Saved → ${normPath}`);
}

run().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
