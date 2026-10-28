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
