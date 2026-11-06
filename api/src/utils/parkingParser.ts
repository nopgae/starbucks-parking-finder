export type ParkingType = "FREE" | "PAID" | "VALIDATION" | "UNAVAILABLE" | "UNKNOWN";

export interface ParsedParking {
  parkingType: ParkingType;
  hasParking: boolean;
  parkCapacity: string | null;
  parkLocation: string | null;
  parkPriceRaw: string | null;
  parkCondition: string | null;
  parkPayment: string | null;
  // Longest free time the note offers: minutes, "unlimited" (FREE with no limit stated), or null (unknown / not free)
  freeMinutes: number | "unlimited" | null;
}

// Whole-note "no parking": "주차지원불가" alone, "이용 절대 불가", "미지원 / 인근 공영주차장"
const NO_PARKING =
  /이용\s*절대\s*불가|^\s*(1\.\s*)?(주차\s*)?(지원\s*)?(불가|미지원)\s*$|^\s*주차불\s*$|(지원\s*불가|미지원).*(인근|공영|공용)/;

// The note opens with "no parking" ("주차 불가", "1. 주차불가능", "주차 안됨", "전용 주차장 없음").
// A later "주말 주차불가" or "SUV 주차불가" only limits a lot that exists, so it is not matched.
const HEADLINE_NO_PARKING = /^\s*(1\s*[.,]\s*)?(매장\s*|건물\s*|전용\s*)?주차장?\s*(가\s*)?(불가능?|미지원|안\s*됨|없음)/;
const PUBLIC_LOT = /공영|공용|노상|인근/;

// "주차지원 불가 / 요금 부과 / 주차권 발행 불가": parking exists but the store doesn't cover it
const NO_SUPPORT =
  /주차\s*(요금\s*)?(할인\s*)?지원\s*(불가|없음)|무료\s*지원\s*불가|지원\s*없음|요금\s*부과|출차\s*시\s*결제|혜택\s*없음|주차권\s*발행\s*불가|등록\s*없음/;

// Purchase/registration-based time: "1만원 이상 2시간", "결제 시", "1시간 제공", "차량 번호 등록", "금액 무관".
// "매장 이용 시" counts, "호텔 주차장 이용 시 10분당 2천원" does not.
const VALIDATION =
  /구매\s*(시|후)|구매\s*고객|구매하신|구매금액|영수증|스탬프|(?<!주차장\s*)이용\s*시|조건부|결제\s*(시|금액|요건)|주문\s*시|(\d|[천만])\s*원\s*(이상|이하|미만)|\d+\s*(시간|분)\s*(주차\s*)?(제공|할인|지원)|주차권(?!\s*발행\s*불가)|주차증|(주차|번호|직접|파트너)\s*등록(?!\s*(없|방법))|등록\s*(요청|필요|가능)|금액\S*\s*(상관\s*없|무관)/;

// "주차조건-없음", "시간제한 없음", "정산 필요 없음": no condition or fee stated
const NO_CONDITION = /조\s*건\s*[-:]?\s*(없음|무(?![가-힣]))|시간\s*제한\s*없음|제한\s*시간\s*없음|정산\s*필요\s*없음/;

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
    text.match(/\d+분당\s*[\d,]+[천만]?원/) ||
    text.match(/\d+분\s*[\d,]+[천만]?원/) ||
    text.match(/\d+시간\s*[\d,]+[천만]?원/) ||
    text.match(/[\d,]+[천만]?원\s*\/\s*\d+분/) ||
    text.match(/[\d,]+[천만]?원\s*\d+분/);
  return match ? match[0].trim() : null;
}

// "2시간", "1시간 30분", "90분", "두 시간"; the lookbehind keeps "제한시간" from reading as "한시간"
const DURATION = /(\d+|(?<![가-힣])(?:한|두|세|네|다섯))\s*시간(?:\s*(\d+)\s*분)?|(\d+)\s*분/g;
const WORD_HOURS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };
// rates ("10분당"), overage ("30분 초과", "3시간 이상 체류시") and prices ("1시간 5천원", "1일(24시간) 60,000원") are not free time
const NOT_FREE_AFTER = /^\s*\)?\s*(당|마다|초과|~|이상\s*(체류|주차|이용)|(이내\s*)?[\d,]+\s*[천만]?\s*원)/;

function maxFreeMinutes(text: string): number | null {
  let max: number | null = null;
  for (const m of text.matchAll(DURATION)) {
    const before = text.slice(0, m.index);
    // "61분~90분 기본요금" is a paid band; "운영시간 : 24시간" is opening hours
    if (NOT_FREE_AFTER.test(text.slice(m.index! + m[0].length)) || /(운영\s*시간\s*[:：]?|~)\s*$/.test(before)) continue;
    const minutes = m[3] ? Number(m[3]) : (WORD_HOURS[m[1]] ?? Number(m[1])) * 60 + Number(m[2] ?? 0);
    if (max === null || minutes > max) max = minutes;
  }
  return max;
}

function isUnavailable(raw: string): boolean {
  if (NO_PARKING.test(raw)) return true;
  const head = raw.match(HEADLINE_NO_PARKING);
  if (!head) return false;
  // "1.주차불가능 2.건물내 유료주차장 이용 가능(10분 1,000원)": no store parking, but the building's own lot is usable
  const rest = raw.slice(head[0].length);
  return PUBLIC_LOT.test(rest) || classify(rest) === "UNKNOWN";
}

function detectType(raw: string): ParkingType {
  return isUnavailable(raw) ? "UNAVAILABLE" : classify(raw);
}

function classify(raw: string): ParkingType {
  // "무료 주차지원 불가" negates the free, it doesn't offer it
  const hasFree = /무료(?!\s*(주차\s*)?지원\s*불가)/.test(raw);
  const noSupport = NO_SUPPORT.test(raw);
  if (noSupport && !hasFree) return "PAID";

  const hasValidation = VALIDATION.test(raw);
  const hasPaid = raw.includes("유료") || extractPrice(raw) !== null || noSupport;

  if (hasValidation) return "VALIDATION";
  if (hasFree && !hasPaid) return "FREE";
  if (hasPaid && !hasFree) return "PAID";
  if (hasFree && hasPaid) return "VALIDATION"; // free-with-purchase then paid
  if (NO_CONDITION.test(raw)) return "FREE";

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
    freeMinutes: null,
  };

  if (!raw || raw.trim() === "") return empty;

  if (isUnavailable(raw)) {
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

  // Max over the whole note: tiers ("1만원 1시간 … 5만원 5시간") are often split across numbered items
  const minutes = maxFreeMinutes(raw);
  const freeMinutes = type === "FREE" ? minutes ?? "unlimited" : type === "VALIDATION" ? minutes : null;

  return {
    parkingType: type,
    hasParking: true,
    parkCapacity: capacity,
    parkLocation: location,
    parkPriceRaw: price,
    parkCondition: conditionRaw,
    parkPayment: paymentRaw,
    freeMinutes,
  };
}
