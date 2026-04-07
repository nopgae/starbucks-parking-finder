export type ParkingType = "FREE" | "PAID" | "VALIDATION" | "UNAVAILABLE" | "UNKNOWN";

export interface ParsedParking {
  parkingType: ParkingType;
  hasParking: boolean;
  parkCapacity: string | null;
  parkLocation: string | null;
  parkPriceRaw: string | null;
  parkCondition: string | null;
  parkPayment: string | null;
}

const NO_PARKING_PATTERNS = ["주차 불가", "주차불가", "주차가 불가", "주차없음"];

function splitItems(text: string): string[] {
  // Handles both newline-separated and space-separated numbered lists
  // e.g. "1.주차가능 2.주차장위치..." or "1.\n주차가능\n2...."
  return text
    .split(/(?=\s*\d+\s*[.)]\s*)/)
    .map((s) => s.replace(/^\s*\d+\s*[.)]\s*/, "").trim())
    .filter(Boolean);
}

function findItem(items: string[], keywords: string[]): string | null {
  for (const item of items) {
    if (keywords.some((kw) => item.includes(kw))) {
      // Strip the keyword label prefix (e.g. "주차가능대수-" or "주차장 위치-")
      const cleaned = item.replace(/^[\w가-힣\s]+[-:]\s*/, "").trim();
      return cleaned || item.trim();
    }
  }
  return null;
}

function extractPrice(text: string): string | null {
  const match =
    text.match(/\d+분당\s*[\d,]+원/) ||
    text.match(/\d+분\s*[\d,]+원/) ||
    text.match(/\d+시간\s*[\d,]+원/) ||
    text.match(/[\d,]+원\s*\/\s*\d+분/) ||
    text.match(/[\d,]+원\s*\d+분/);
  return match ? match[0].trim() : null;
}

function detectType(raw: string): ParkingType {
  if (NO_PARKING_PATTERNS.some((p) => raw.includes(p))) return "UNAVAILABLE";

  const hasValidation =
    raw.includes("구매 시") ||
    raw.includes("구매시") ||
    raw.includes("구매후") ||
    raw.includes("구매 후") ||
    raw.includes("영수증") ||
    raw.includes("스탬프") ||
    raw.includes("이용 시") ||
    raw.includes("이용시") ||
    raw.includes("조건부");

  const hasFree = raw.includes("무료");
  const hasPaid = raw.includes("유료") || extractPrice(raw) !== null;

  if (hasValidation) return "VALIDATION";
  if (hasFree && !hasPaid) return "FREE";
  if (hasPaid && !hasFree) return "PAID";
  if (hasFree && hasPaid) return "VALIDATION"; // free-with-purchase then paid
  if (raw.includes("주차가능") || raw.includes("주차 가능")) return "UNKNOWN";

  return "UNKNOWN";
}

export function parseParking(raw: string | null): ParsedParking {
  const empty: ParsedParking = {
    parkingType: "UNKNOWN",
    hasParking: false,
    parkCapacity: null,
    parkLocation: null,
    parkPriceRaw: null,
    parkCondition: null,
    parkPayment: null,
  };

  if (!raw || raw.trim() === "") return empty;

  if (NO_PARKING_PATTERNS.some((p) => raw.includes(p))) {
    return { ...empty, parkingType: "UNAVAILABLE", hasParking: false };
  }

  const items = splitItems(raw);
  const type = detectType(raw);

  const capacity = findItem(items, ["주차가능대수", "주차대수", "주차 대수"]);
  const location = findItem(items, ["주차장위치", "주차장 위치", "위치"]);
  const conditionRaw = findItem(items, ["주차조건", "주차 조건", "조건"]);
  const paymentRaw = findItem(items, ["주차요금정산", "정산", "요금정산"]);

  // Extract price from condition item or full text
  const priceSource = conditionRaw ?? raw;
  const price = extractPrice(priceSource);

  return {
    parkingType: type,
    hasParking: true,
    parkCapacity: capacity,
    parkLocation: location,
    parkPriceRaw: price,
    parkCondition: conditionRaw,
    parkPayment: paymentRaw,
  };
}
