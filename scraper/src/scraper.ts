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
  "Accept-Language": "ko-KR",
};

const RAW_DIR = path.resolve(__dirname, "../data/raw");
const NORM_DIR = path.resolve(__dirname, "../data/normalized");

interface RawStore {
  s_code: string;
  s_name: string;
  s_biz_code: string;
  addr: string;
  doro_address: string;
  lat: string;
  lot: string;
  sido_code: string;
  sido_name: string;
  gugun_code: string;
  gugun_name: string;
  tel: string;
  park_info: string | null;
  p_parking_yn: string | null;
  theme_state: string | null;
  open_dt: string;
  // parking feature flags
  p10: number;
  p20: number;
  p30: number;
  p40: number;
  p50: number;
  p60: number;
  p70: number;
  p80: number;
  p90: number;
  p01: number;
}

interface SidoItem {
  sido_cd: string;
  sido_nm: string;
}

interface NormalizedStore {
  storeCode: string;
  bizCode: string;
  name: string;
  address: string;
  roadAddress: string;
  lat: number;
  lng: number;
  sido: string;
  sidoCode: string;
  gugun: string;
  gugunCode: string;
  phone: string;
  openedAt: string;
  parking: {
    hasParking: boolean;
    parkInfo: string | null;
    flags: string[];
  };
  themeState: string | null;
}

function rndCod(): string {
  return Math.random().toString(36).substring(2, 12).toUpperCase();
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSidoList(): Promise<SidoItem[]> {
  const params = new URLSearchParams({ rndCod: rndCod() });
  const res = await axios.post(`${BASE}/store/getSidoList.do`, params.toString(), {
    headers: HEADERS,
  });
  return res.data.list.filter((s: SidoItem) => s.sido_cd && s.sido_nm);
}

async function getGugunList(sidoCd: string): Promise<Array<{ gugun_cd: string; gugun_nm: string }>> {
  const params = new URLSearchParams({ sido_cd: sidoCd, rndCod: rndCod() });
  try {
    const res = await axios.post(`${BASE}/store/getGugunList.do`, params.toString(), {
      headers: HEADERS,
    });
    return res.data.list.filter((g: { gugun_cd: string }) => g.gugun_cd);
  } catch {
    return [];
  }
}

async function getStoresBySido(sidoCd: string, gugunCd = ""): Promise<RawStore[]> {
  const params = new URLSearchParams({
    in_biz_cds: "0",
    in_scodes: "0",
    ins_lat: "",
    ins_lng: "",
    search_text: "",
    p_sido_cd: sidoCd,
    p_gugun_cd: gugunCd,
    isError: "true",
    in_distance: "0",
    in_biz_cd: "",
    iend: "999",
    searchType: "C", // C = by region (sido/gugun), A = by location
    set_date: "",
    rndCod: rndCod(),
  });

  const res = await axios.post(`${BASE}/store/getStore.do`, params.toString(), {
    headers: HEADERS,
  });

  return res.data.list ?? [];
}

// Decode which parking flags are active from the P-code fields
function parseParkingFlags(store: RawStore): string[] {
  const flagMap: Record<string, string> = {
    p01: "P01",
    p10: "P10",
    p20: "P20",
    p30: "P30",
    p40: "P40",
    p50: "P50",
    p60: "P60",
    p70: "P70",
    p80: "P80",
    p90: "P90",
  };
  return Object.entries(flagMap)
    .filter(([key]) => (store as unknown as Record<string, unknown>)[key] === 1)
    .map(([, code]) => code);
}

function normalize(raw: RawStore): NormalizedStore {
  const parkingFlags = parseParkingFlags(raw);
  const hasParking =
    raw.p_parking_yn === "Y" ||
    parkingFlags.length > 0 ||
    raw.park_info !== null;

  return {
    storeCode: raw.s_code ?? "",
    bizCode: raw.s_biz_code ?? "",
    name: raw.s_name ?? "",
    address: raw.addr ?? "",
    roadAddress: raw.doro_address ?? "",
    lat: parseFloat(raw.lat) || 0,
    lng: parseFloat(raw.lot) || 0,
    sido: raw.sido_name ?? "",
    sidoCode: raw.sido_code ?? "",
    gugun: raw.gugun_name ?? "",
    gugunCode: raw.gugun_code ?? "",
    phone: raw.tel ?? "",
    openedAt: raw.open_dt ?? "",
    parking: {
      hasParking,
      parkInfo: raw.park_info,
      flags: parkingFlags,
    },
    themeState: raw.theme_state,
  };
}

async function run() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(NORM_DIR, { recursive: true });

  console.log("[1/4] Fetching sido list...");
  const sidoList = await getSidoList();
  console.log(`      Found ${sidoList.length} provinces: ${sidoList.map((s) => s.sido_nm).join(", ")}`);

  const allRaw: RawStore[] = [];
  const seenCodes = new Set<string>();

  for (const sido of sidoList) {
    console.log(`\n[SIDO] ${sido.sido_nm} (${sido.sido_cd})`);

    // Try to get gugun list for finer-grained pagination
    const gugunList = await getGugunList(sido.sido_cd);
    await sleep(300);

    if (gugunList.length > 0) {
      console.log(`       ${gugunList.length} districts — querying each...`);
      for (const gugun of gugunList) {
        const stores = await getStoresBySido(sido.sido_cd, gugun.gugun_cd);
        let newCount = 0;
        for (const store of stores) {
          if (store.s_code && !seenCodes.has(store.s_code)) {
            seenCodes.add(store.s_code);
            allRaw.push(store);
            newCount++;
          }
        }
        if (newCount > 0) {
          console.log(`       ${gugun.gugun_nm}: +${newCount} stores`);
        }
        await sleep(200);
      }
    } else {
      // Fallback: query by sido only
      const stores = await getStoresBySido(sido.sido_cd);
      let newCount = 0;
      for (const store of stores) {
        if (store.s_code && !seenCodes.has(store.s_code)) {
          seenCodes.add(store.s_code);
          allRaw.push(store);
          newCount++;
        }
      }
      console.log(`       (no gugun list) +${newCount} stores`);
      await sleep(300);
    }
  }

  // Save raw
  const rawPath = path.join(RAW_DIR, "stores-raw.json");
  fs.writeFileSync(rawPath, JSON.stringify(allRaw, null, 2), "utf-8");
  console.log(`\n[2/4] Raw data saved → ${rawPath} (${allRaw.length} stores)`);

  // Normalize
  const normalized = allRaw.map(normalize);
  const normPath = path.join(NORM_DIR, "stores.json");
  fs.writeFileSync(normPath, JSON.stringify(normalized, null, 2), "utf-8");
  console.log(`[3/4] Normalized data saved → ${normPath}`);

  // Parking stats
  const withParking = normalized.filter((s) => s.parking.hasParking);
  const withParkInfo = normalized.filter((s) => s.parking.parkInfo !== null);

  console.log(`\n[4/4] Summary`);
  console.log(`      Total stores:           ${normalized.length}`);
  console.log(`      Stores with parking:    ${withParking.length}`);
  console.log(`      Stores with park_info:  ${withParkInfo.length}`);

  if (withParkInfo.length > 0) {
    console.log(`\n      Sample park_info values:`);
    withParkInfo.slice(0, 5).forEach((s) => {
      console.log(`        [${s.name}] → "${s.parking.parkInfo}"`);
    });
  }

  // Save parking-only subset
  const parkingPath = path.join(NORM_DIR, "stores-with-parking.json");
  fs.writeFileSync(parkingPath, JSON.stringify(withParking, null, 2), "utf-8");
  console.log(`\n      Parking subset saved → ${parkingPath}`);
}

run().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
