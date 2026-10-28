import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery } from "../src/utils/queryParser";

test("station, free parking and minimum hours", () => {
  assert.deepEqual(parseQuery("강남역 근처 무료 주차 두시간 이상"), {
    location: "강남역",
    minHours: 2,
    parkingType: "free",
    drivethru: false,
  });
});

test("digit hours and paid-ok wording", () => {
  const q = parseQuery("판교역 유료도 괜찮아 3시간 이상");
  assert.equal(q.location, "판교역");
  assert.equal(q.minHours, 3);
  assert.equal(q.parkingType, "paid");
});

test("hours without a minimum constraint are ignored", () => {
  assert.equal(parseQuery("홍대입구역 2시간 주차").minHours, null);
});

test("drive-thru with or without a space", () => {
  assert.equal(parseQuery("드라이브스루 매장").drivethru, true);
  assert.equal(parseQuery("드라이브 스루 되는 곳").drivethru, true);
});

test("no parking keywords gives null parkingType", () => {
  assert.equal(parseQuery("잠실역 매장").parkingType, null);
});
