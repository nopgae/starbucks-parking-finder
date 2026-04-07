import axios from "axios";
import { rateLimiter } from "./rateLimiter";

export interface GeoResult {
  lat: number;
  lng: number;
  address: string;
}

// ── Naver Local Search API ────────────────────────────────────────────────────
// Keys: NAVER_SEARCH_CLIENT_ID + NAVER_SEARCH_CLIENT_SECRET (Naver Developers)
// Free tier: 25,000 calls/day. We enforce a soft cap of 20,000 via rateLimiter.
// ─────────────────────────────────────────────────────────────────────────────
export async function geocode(query: string): Promise<GeoResult | null> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[geocode] NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET not set — using fallback");
    return fallbackGeocode(query);
  }

  // Block if daily soft limit reached — avoids surprise charges
  if (!rateLimiter.check("naver_search")) {
    console.warn("[geocode] Rate limit reached — using fallback");
    return fallbackGeocode(query);
  }

  try {
    // Naver Local Search API — finds places, stations, addresses by name
    const res = await axios.get("https://openapi.naver.com/v1/search/local.json", {
      params: { query, display: 1 },
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      timeout: 5000,
    });

    rateLimiter.record("naver_search"); // count only successful calls

    const items = res.data?.items ?? [];
    if (items.length === 0) return fallbackGeocode(query);

    const first = items[0];
    // Naver Local Search returns coords in KATECH (mapx/mapy) — divide by 1e7 for WGS84
    return {
      lat: parseFloat(first.mapy) / 1e7,
      lng: parseFloat(first.mapx) / 1e7,
      address: first.roadAddress || first.address || query,
    };
  } catch (err) {
    console.error("[geocode] Naver API error:", (err as Error).message);
    return fallbackGeocode(query);
  }
}

// ── Fallback: hardcoded major Seoul subway stations ───────────────────────────
// Covers the most common query locations without needing an API key
// ─────────────────────────────────────────────────────────────────────────────
const STATION_COORDS: Record<string, { lat: number; lng: number }> = {
  강남역:     { lat: 37.4979, lng: 127.0276 },
  홍대입구역: { lat: 37.5572, lng: 126.9241 },
  신촌역:     { lat: 37.5553, lng: 126.9366 },
  건대입구역: { lat: 37.5404, lng: 127.0699 },
  잠실역:     { lat: 37.5133, lng: 127.1001 },
  신림역:     { lat: 37.4844, lng: 126.9294 },
  사당역:     { lat: 37.4765, lng: 126.9815 },
  이태원역:   { lat: 37.5344, lng: 126.9946 },
  명동역:     { lat: 37.5638, lng: 126.9857 },
  종로3가역:  { lat: 37.5706, lng: 126.9917 },
  시청역:     { lat: 37.5651, lng: 126.9774 },
  서울역:     { lat: 37.5547, lng: 126.9706 },
  동대문역:   { lat: 37.5713, lng: 127.0097 },
  압구정역:   { lat: 37.5270, lng: 127.0283 },
  선릉역:     { lat: 37.5045, lng: 127.0492 },
  역삼역:     { lat: 37.5007, lng: 127.0367 },
  교대역:     { lat: 37.4938, lng: 127.0140 },
  판교역:     { lat: 37.3947, lng: 127.1112 },
  정자역:     { lat: 37.3601, lng: 127.1086 },
  수원역:     { lat: 37.2661, lng: 127.0000 },
  인천역:     { lat: 37.4738, lng: 126.6161 },
  부산역:     { lat: 35.1147, lng: 129.0422 },
  해운대역:   { lat: 35.1628, lng: 129.1639 },
  대구역:     { lat: 35.8799, lng: 128.6260 },
  광주송정역: { lat: 35.1395, lng: 126.7946 },
  대전역:     { lat: 36.3322, lng: 127.4345 },
};

function fallbackGeocode(query: string): GeoResult | null {
  // Try exact match first
  const exact = STATION_COORDS[query];
  if (exact) return { ...exact, address: query };

  // Try partial match (e.g. "강남" matches "강남역")
  for (const [name, coords] of Object.entries(STATION_COORDS)) {
    if (name.includes(query) || query.includes(name.replace("역", ""))) {
      return { ...coords, address: name };
    }
  }

  return null;
}
