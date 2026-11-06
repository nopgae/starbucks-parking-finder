---
name: starbucks-parking
description: 한국 스타벅스 매장의 주차 가능 여부, 무료 주차 시간, 주차 조건을 찾아 알려준다. "공덕쪽 스타벅스 주차되는 곳 알려줘", "판교 가는데 주차 되는 스타벅스 찾아줘", "강남역 근처 2시간 무료 주차 되는 스타벅스", "스타벅스 OO점 주차 돼?"처럼 스타벅스와 주차를 함께 묻는 질문에 사용. Use for Starbucks Korea parking questions (free, validated or paid parking at Starbucks stores near a place in Korea).
---

# 스타벅스 주차 찾기

데이터는 이 폴더의 `stores.csv`입니다. 스타벅스 코리아 공식 매장 안내 중 주차 안내가 있는 매장이며, 수집일은 `collected-at.txt`(검색 결과 첫 줄에도 나옴), 출처는 https://github.com/nopgae/starbucks-parking-finder 입니다.

## 1. 검색

이 SKILL.md가 있는 폴더에서 실행합니다 (`python3`이 없으면 `python`).

```bash
python3 scripts/find.py --near 공덕                    # 공덕 주변 2km, 주차 되는 곳 (가까운 순)
python3 scripts/find.py --near 판교 --type free        # 무료 + 조건부 무료
python3 scripts/find.py --near 강남역 --min-hours 2    # 무료 2시간 이상
python3 scripts/find.py --name 강남세곡DT              # 특정 매장의 주차 안내
python3 scripts/find.py --lat 37.544 --lng 126.951 --radius 1
```

- `--near`는 매장 이름(공덕, 판교, 강남역)을 먼저 찾고, 없으면 동·구·주소로 찾아 기준점을 잡습니다.
- "맞는 매장 이름·동·주소가 없음"이나 "여러 지역에 걸침"이 나오면, 그 장소의 위도·경도를 직접 판단해 `--lat --lng`로 다시 실행합니다.
- 반경: "~쪽", "가는 길"처럼 넓게 물으면 `--radius 3`, 역 바로 앞이면 `--radius 1`. 결과가 없으면 반경을 늘려 한 번 더 찾고, 그래도 없으면 없다고 답합니다.
- `--type`: `any`(기본, 주차 불가 제외) · `free`(무료+조건부 무료) · `free-only`(구매 조건 없는 무료) · `all`.

## 2. 답변

- 가까운 순으로 3~5곳을 고릅니다. 매장마다 한 줄로 쓰고 네이버 지도 링크를 붙입니다.
  예: **스타벅스 마포이마트점** (0.2km) — 조건부 무료, 결제 시 주차권 출력 1시간 무료 · [네이버 지도](https://map.naver.com/p/search/...)
- 조건은 "주차 안내 원문"을 읽고 요약합니다 (구매 금액, 무료 시간, 차량 등록 방법, 초과 요금).
- 분류(무료/조건부 무료/유료)는 규칙으로 자동 분류한 것이라, 원문과 다르면 원문을 따릅니다.
- "무료 주차"를 물으면 `--type free` 결과로 답하고, 구매 조건 없이 무료인 곳을 먼저 쓰고 조건부는 조건을 밝힙니다.
- 마지막에 한 줄을 덧붙입니다: "<데이터 기준일> 기준 매장 안내라 바뀌었을 수 있으니 방문 전에 확인하세요." (기준일은 검색 결과 첫 줄)
- 데이터에 없는 매장은 "주차 정보 없음"입니다(주차 불가가 아님). 데이터에 없는 매장이나 조건을 지어내지 않습니다.
