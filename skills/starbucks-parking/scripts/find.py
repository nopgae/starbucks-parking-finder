#!/usr/bin/env python3
"""Find Starbucks Korea stores with parking near a place.

  find.py --near 공덕                       stores around 공덕 (matched by store name, then dong/address)
  find.py --near 판교 --type free --min-hours 2
  find.py --lat 37.544 --lng 126.951 --radius 1.5
  find.py --name 강남세곡DT                 one store's parking note
"""
from __future__ import annotations  # "float | None" on Python 3.9 (macOS system python)

import argparse
import csv
import math
import statistics
import sys
from pathlib import Path

CSV = Path(__file__).resolve().parent.parent / "stores.csv"
COLLECTED = (CSV.parent / "collected-at.txt").read_text(encoding="utf-8").strip()
TYPES = {
    "any": {"FREE", "VALIDATION", "PAID", "UNKNOWN"},  # parking exists (drops 주차 불가)
    "free": {"FREE", "VALIDATION"},  # free, or free with a purchase / registration
    "free-only": {"FREE"},  # free without conditions
    "all": {"FREE", "VALIDATION", "PAID", "UNKNOWN", "UNAVAILABLE"},
}


def km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    p = math.pi / 180
    h = math.sin((b_lat - a_lat) * p / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lng - a_lng) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def norm(s: str) -> str:
    return s.replace(" ", "").lower()


def free_ok(row: dict, min_hours: float | None) -> bool:
    if min_hours is None:
        return True
    m = row["freeMinutes"]
    return m == "unlimited" or (m.isdigit() and int(m) >= min_hours * 60)


def free_label(m: str) -> str:
    if m == "unlimited":
        return "시간 제한 없음"
    if not m:
        return ""
    h, r = divmod(int(m), 60)
    return "무료 최대 " + " ".join(p for p in (f"{h}시간" if h else "", f"{r}분" if r else "") if p)


def show(i: int, row: dict, dist: float | None) -> None:
    free = free_label(row["freeMinutes"])
    head = f"{i}. 스타벅스 {row['name']}점" + (f" ({dist:.1f}km)" if dist is not None else "")
    print(f"{head} — {row['parking']}" + (f" · {free}" if free else ""))
    print(f"   주소: {row['address']}")
    print(f"   주차 안내 원문: {row['note']}")
    print(f"   네이버 지도: {row['naverMap']}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--near", help="place: store-name fragment, dong or gu (공덕, 판교, 성수동)")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lng", type=float)
    ap.add_argument("--radius", type=float, default=2.0, help="km, default 2")
    ap.add_argument("--name", help="look up stores whose name contains this")
    ap.add_argument("--type", choices=TYPES, default="any")
    ap.add_argument("--min-hours", type=float, help="free parking for at least this many hours")
    ap.add_argument("--limit", type=int, default=10)
    a = ap.parse_args()

    with CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if a.name:
        hits = [r for r in rows if norm(a.name).removesuffix("점") in norm(r["name"])]
        print(f"데이터 기준일: {COLLECTED} · '{a.name}' 이름이 들어간 매장 {len(hits)}곳 (주차 안내가 있는 매장만 데이터에 있음)")
        for i, r in enumerate(hits[: a.limit], 1):
            show(i, r, None)
        return 0 if hits else 1

    if a.lat is not None and a.lng is not None:
        lat, lng, origin = a.lat, a.lng, f"좌표 {a.lat}, {a.lng}"
    elif a.near:
        q = norm(a.near).removesuffix("점")
        matches = [r for r in rows if q in norm(r["name"])] or [r for r in rows if q in norm(r["dong"] + r["gugun"] + r["address"])]
        if not matches:
            print(f"'{a.near}'와 맞는 매장 이름·동·주소가 없음. 그 장소의 위도·경도를 --lat --lng로 넣어 다시 실행하세요.")
            return 1
        lat = statistics.median(float(r["lat"]) for r in matches)
        lng = statistics.median(float(r["lng"]) for r in matches)
        spread = max(km(lat, lng, float(r["lat"]), float(r["lng"])) for r in matches)
        origin = f"'{a.near}' 매칭 {len(matches)}곳의 중심"
        if spread > 15:
            regions = sorted({f"{r['sido']} {r['gugun']}" for r in matches})
            print(f"주의: '{a.near}'가 여러 지역에 걸침({', '.join(regions[:6])}). 더 구체적인 이름이나 --lat --lng를 쓰세요.")
    else:
        ap.error("--near, --lat/--lng, --name 중 하나가 필요합니다")

    near = sorted(
        ((km(lat, lng, float(r["lat"]), float(r["lng"])), r) for r in rows),
        key=lambda x: x[0],
    )
    in_radius = [(d, r) for d, r in near if d <= a.radius]
    hits = [(d, r) for d, r in in_radius if r["parkingType"] in TYPES[a.type] and free_ok(r, a.min_hours)]
    print(f"데이터 기준일: {COLLECTED}")
    print(f"기준: {origin} · 반경 {a.radius}km · 조건: {a.type}" + (f", 무료 {a.min_hours}시간 이상" if a.min_hours else ""))
    print(f"반경 안 주차 안내 매장 {len(in_radius)}곳 중 조건에 맞는 곳 {len(hits)}곳 (가까운 순)\n")
    for i, (d, r) in enumerate(hits[: a.limit], 1):
        show(i, r, d)
    if not hits:
        print("조건에 맞는 매장이 없음. --radius를 늘리거나 --type/--min-hours를 완화해 보세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
