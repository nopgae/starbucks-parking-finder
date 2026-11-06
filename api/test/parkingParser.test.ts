import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParking } from "../src/utils/parkingParser";

test("empty or missing park_info is UNKNOWN with no parking", () => {
  for (const raw of [null, "", "   "]) {
    const r = parseParking(raw);
    assert.equal(r.parkingType, "UNKNOWN");
    assert.equal(r.hasParking, false);
  }
});

test("'주차 불가' is UNAVAILABLE", () => {
  const r = parseParking("주차 불가 (인근 공영주차장 이용)");
  assert.equal(r.parkingType, "UNAVAILABLE");
  assert.equal(r.hasParking, false);
});

test("free parking only", () => {
  assert.equal(parseParking("1.주차가능 2.주차장위치-건물 지하 3.무료").parkingType, "FREE");
});

test("paid parking is detected from a price even without '유료'", () => {
  const r = parseParking("1.주차가능 2.주차조건-10분당 1,000원");
  assert.equal(r.parkingType, "PAID");
  assert.equal(r.parkPriceRaw, "10분당 1,000원");
});

test("purchase-based free parking is VALIDATION", () => {
  assert.equal(parseParking("1.주차가능 2.주차조건-음료 구매 시 1시간 무료").parkingType, "VALIDATION");
});

test("numbered items are split into fields", () => {
  const r = parseParking("1.주차가능대수-20대 2.주차장위치-지하 2층 3.주차요금정산-매장 내 정산");
  assert.equal(r.hasParking, true);
  assert.equal(r.parkCapacity, "20대");
  assert.equal(r.parkLocation, "지하 2층");
  assert.equal(r.parkPayment, "매장 내 정산");
});

test("'주차지원 불가' wording and nearby public lots are UNAVAILABLE", () => {
  for (const raw of ["주차 미지원 / 인근 공영주차장 사용", "주차지원불가", "1. 주차 지원 불가", "불가", "주차지원 불가. 세종대 공용 주차장 이용 가능"]) {
    assert.equal(parseParking(raw).parkingType, "UNAVAILABLE", raw);
  }
  // a closed sub-lot is not the whole store
  assert.notEqual(parseParking("1.주차가능 2.지하주차장 이용가능(식품관 주차장 이용불가) 3.1시간 무료").parkingType, "UNAVAILABLE");
});

test("spend thresholds, registration and '금액 무관' are VALIDATION", () => {
  for (const raw of [
    "1.주차가능 4.주차조건 - 스타벅스 결제금액 5천원 이상시 1시간 제공",
    "주차가능 / BIFC MALL 건물 내 1시간 이용가능(금액상관없음)",
    "4. 주차조건 - 매장내 테블릿 PC에 차량 번호 등록(1시간)_금액 무관",
    "4. 주차조건 - 1만원 이상 60분, 2만원 이상 120분",
    "4.주차조건-구매고객 2시간 무료",
  ]) {
    assert.equal(parseParking(raw).parkingType, "VALIDATION", raw);
  }
});

test("'주차조건-없음' and similar no-condition notes are FREE", () => {
  for (const raw of ["1. 주차가능 2.주차조건-없음", "1.주차가능 4.시간제한없음", "4. 주차요금 정산방법 -정산 필요 없음", "4.주차조건-무"]) {
    assert.equal(parseParking(raw).parkingType, "FREE", raw);
  }
});

test("no store support or '천원' prices are PAID, not VALIDATION", () => {
  const r = parseParking("건물 내 주차 가능, 주차 할인 지원 불가 (1시간 5천원, 초과 15분당 1천원)");
  assert.equal(r.parkingType, "PAID");
  assert.equal(r.parkPriceRaw, "15분당 1천원");
  for (const raw of [
    "4. 주차조건 - 병원 주차 이용 기준에 따라 요금 부과 (스타벅스 이용객 별도 주차지원 없음)",
    "1.신세계 타임스퀘어 지하주차장사용 가능 2. 무료 주차지원 불가능",
    "1.주차권 발행 불가 4.주차조건- 유료(10분당-1,000원)",
    "4.주차조건- 10분당 700원 (주차 등록 없음)",
  ]) {
    assert.equal(parseParking(raw).parkingType, "PAID", raw);
  }
});

test("freeMinutes reads minutes, combined hours and the top tier", () => {
  const cases: [string, number][] = [
    ["구매 고객 30분 무료(스타벅스 카드 충전 제외)", 30],
    ["4.주차조건- 구매고객 1시간 30분 무료", 90],
    ["4.주차조건 : 스타벅스이용고객 한시간 무료", 60],
    ["4. 주차조건 - 1만원 이상 1시간 5.무료시간 할인기준 : 3만원 이상 3시간, 5만원 이상 5시간", 300],
  ];
  for (const [raw, minutes] of cases) assert.equal(parseParking(raw).freeMinutes, minutes, raw);
});

test("freeMinutes skips rates, prices, paid bands and opening hours", () => {
  const cases: [string, number][] = [
    ["4.주차조건-최초 30분 무료, 이후 10분당 1천원", 30],
    ["4.주차 조건-1시간 무료(61분~90분 기본주차요금 2000원 적용. 10분 초과시 500원 추가)", 60],
    ["4.주차조건-기본 30분 무료 / 1만원 이상 구매 : 1시간 추가 무료 / 운영시간 : 24시간", 60],
    ["4.주차조건-당일 구매 시 1시간 무료 6. 주말 3시간 이상 체류시 할인 적용 불가능", 60],
  ];
  for (const [raw, minutes] of cases) assert.equal(parseParking(raw).freeMinutes, minutes, raw);
});

test("freeMinutes: FREE without a limit is unlimited, VALIDATION without one is unknown, PAID is null", () => {
  assert.equal(parseParking("1.주차가능 4.주차정산 비용 및 제한시간 없음").freeMinutes, "unlimited");
  assert.equal(parseParking("1.주차가능 2.매장 전면 4.주차조건-무료").freeMinutes, "unlimited");
  assert.equal(parseParking("4.주차조건:스타벅스 구매고객에 한함").freeMinutes, null);
  assert.equal(parseParking("1.주차가능 2.주차조건-1시간 6000원").freeMinutes, null);
});

test("only an opening 'no parking' makes a store UNAVAILABLE", () => {
  for (const raw of ["1. 주차불가능", "주차 안됨", "1.주차불가능 2.인근 어린이대공원후문 공영주차장 이용 가능(유료)", "전용 주차장 없음 , 100m 내에 공영주차장 이용가능 (1시간 무료)"]) {
    assert.equal(parseParking(raw).parkingType, "UNAVAILABLE", raw);
  }
  // a later "주말 주차불가" / "SUV 주차불가" limits a lot that exists
  assert.equal(parseParking("1.주차가능 4. 주차조건-조건부무료(영수증 지참 30분 무료) /주말 및 공휴일-주차불가").parkingType, "VALIDATION");
  assert.equal(parseParking("1.주차가능 3.주차가능대수-58대(기계식주차장_RV차량 주차불가) 4.주차조건-무료").parkingType, "FREE");
});

test("'주차 불가' with the building's own paid lot is PAID", () => {
  for (const raw of [
    "1.주차불가능 2.건물내 유료주차장 이용 가능(주차시 이용금액 기본 10분 1,000원,추가 10분당 1,000원)",
    "1.주차 불가능 2.호텔 주차장 이용 시 10분당 2천원 부과",
    "1. 주차불가, 건물 주차장 有 2. 주차장 위치: 건물 뒷편 주차장 4. 주차조건- 주차 무료 지원 불가",
  ]) {
    assert.equal(parseParking(raw).parkingType, "PAID", raw);
  }
});

test("free 'for store customers' is VALIDATION", () => {
  assert.equal(parseParking("4. 주차조건 - 스타벅스 이용고객 2시간 무료").parkingType, "VALIDATION");
  assert.equal(parseParking("4.주차조건- 무료(매장 이용 고객)").parkingType, "VALIDATION");
});
