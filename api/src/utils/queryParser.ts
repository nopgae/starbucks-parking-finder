export interface ParsedQuery {
  location: string | null;      // "강남역", "홍대", "판교"
  minHours: number | null;      // 2 (from "두시간 이상")
  parkingType: "free" | "paid" | "any" | null;
  drivethru: boolean;
}

// Korean number words → digits
const KOREAN_NUMBERS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5,
  여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

function parseHours(raw: string): number {
  const digit = raw.match(/(\d+)시간/);
  if (digit) return parseInt(digit[1]);
  const korean = raw.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)시간/);
  if (korean) return KOREAN_NUMBERS[korean[1]] ?? 1;
  return 1;
}

function extractLocation(query: string): string | null {
  // Match place names ending in common Korean suffixes
  // Order matters: longer suffixes first to avoid partial matches
  const suffixes = [
    "입구역", "역", "구청", "시청",
    "동", "구", "시", "로", "길", "동네", "부근", "근처",
  ];

  for (const suffix of suffixes) {
    // Match 2–6 Korean chars ending with the suffix
    const re = new RegExp(`([가-힣]{1,6}${suffix})`);
    const match = query.match(re);
    if (match) {
      // Strip trailing noise words if they got included
      return match[1]
        .replace(/(근처|부근|주변|에서|에|의)$/, "")
        .trim();
    }
  }

  // Fallback: grab any standalone Korean word that looks like a place
  // (before 근처/에서/주변)
  const fallback = query.match(/([가-힣]{2,6})\s*(?:근처|에서|주변|에)/);
  return fallback ? fallback[1] : null;
}

function extractMinHours(query: string): number | null {
  // "두시간 이상", "2시간 이상", "2시간 넘게", "2시간은 돼야"
  const hasMinConstraint =
    query.includes("이상") ||
    query.includes("넘게") ||
    query.includes("넘는") ||
    query.includes("이상은") ||
    query.includes("돼야") ||
    query.includes("되는");

  const hasHours =
    query.match(/(\d+|한|두|세|네|다섯)시간/) !== null;

  if (!hasHours) return null;
  if (!hasMinConstraint && !query.includes("이상")) return null;

  return parseHours(query);
}

function extractParkingType(query: string): "free" | "paid" | "any" | null {
  if (
    query.includes("무료") ||
    query.includes("공짜") ||
    query.includes("돈 안") ||
    query.includes("돈안")
  )
    return "free";

  if (
    query.includes("유료도") ||
    query.includes("유료 괜찮") ||
    query.includes("유료 ok") ||
    query.includes("유료ok") ||
    query.includes("유료여도")
  )
    return "paid";

  if (
    query.includes("주차") ||
    query.includes("주차되") ||
    query.includes("주차 되") ||
    query.includes("주차가능") ||
    query.includes("주차 가능") ||
    query.includes("차 세울") ||
    query.includes("차세울")
  )
    return "any";

  return null;
}

export function parseQuery(query: string): ParsedQuery {
  const q = query.trim();
  return {
    location: extractLocation(q),
    minHours: extractMinHours(q),
    parkingType: extractParkingType(q),
    drivethru: q.includes("드라이브스루") || q.includes("드라이브 스루"),
  };
}
