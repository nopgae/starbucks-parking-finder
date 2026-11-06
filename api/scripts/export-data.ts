// Writes the AI-readable data: data/index.md, data/regions/<시도>/<구군>.md and the skill's stores.csv.
//   cd api && npx ts-node scripts/export-data.ts
// CI regenerates and fails on a diff, so commit the output whenever the parser changes.
import fs from "fs";
import path from "path";
import { parseParking, ParkingType, ParsedParking } from "../src/utils/parkingParser";

const ROOT = path.join(__dirname, "../..");
const SNAPSHOT = fs.readFileSync(path.join(ROOT, "scraper/data/normalized/collected-at.txt"), "utf-8").trim(); // written by scraper enrich
const RAW_BASE = "https://raw.githubusercontent.com/nopgae/starbucks-parking-finder/main/data";

const LABEL: Record<ParkingType, string> = {
  FREE: "무료",
  VALIDATION: "조건부 무료",
  PAID: "유료",
  UNAVAILABLE: "주차 불가",
  UNKNOWN: "분류 불가(원문 확인)",
};
const SIDO_ORDER = ["서울", "경기", "인천", "부산", "대구", "전남광주", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

interface Raw { storeCode: string; name: string; address: string; roadAddress: string; lat: number; lng: number; sido: string; gugun: string | null; parking: { info: string | null } | null }
interface Row { code: string; name: string; sido: string; gugun: string; dong: string; address: string; lat: number; lng: number; note: string; parsed: ParsedParking; naver: string }

const naverUrl = (name: string) => `https://map.naver.com/p/search/${encodeURIComponent(`스타벅스 ${name}점`)}`;

function freeLabel(p: ParsedParking): string {
  const m = p.freeMinutes;
  if (m === "unlimited") return "시간 제한 없음";
  if (m === null) return p.parkingType === "VALIDATION" ? "무료 시간은 원문 확인" : "";
  const h = Math.floor(m / 60), r = m % 60;
  return `무료 최대 ${h ? `${h}시간` : ""}${h && r ? " " : ""}${r ? `${r}분` : ""}`;
}

const stores: Raw[] = JSON.parse(fs.readFileSync(path.join(ROOT, "scraper/data/normalized/stores-parking.json"), "utf-8"));
const rows: Row[] = stores
  .filter((s) => s.parking?.info?.trim())
  .map((s) => {
    const sido = s.sido === "강원도" ? "강원" : s.sido.trim();
    const note = s.parking!.info!.replace(/\s+/g, " ").trim();
    return {
      code: s.storeCode,
      name: s.name.trim(),
      sido,
      gugun: s.gugun?.trim() || (sido === "세종" ? "세종시" : "기타"),
      dong: s.address.split(/\s+/).find((t) => /^[가-힣0-9.]+(동|읍|면|가)$/.test(t)) ?? "",
      address: (s.roadAddress || s.address).replace(/\s+/g, " ").trim(),
      lat: s.lat,
      lng: s.lng,
      note,
      parsed: parseParking(note),
      naver: naverUrl(s.name.trim()),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

// ── skill CSV ────────────────────────────────────────────────────────────────
const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = [
  ["name", "sido", "gugun", "dong", "address", "lat", "lng", "parking", "parkingType", "freeMinutes", "naverMap", "note", "storeCode"].join(","),
  ...rows.map((r) =>
    [r.name, r.sido, r.gugun, r.dong, r.address, r.lat, r.lng, LABEL[r.parsed.parkingType], r.parsed.parkingType, r.parsed.freeMinutes ?? "", r.naver, r.note, r.code]
      .map(csvCell)
      .join(","),
  ),
].join("\n") + "\n";
fs.writeFileSync(path.join(ROOT, "skills/starbucks-parking/stores.csv"), csv);
fs.writeFileSync(path.join(ROOT, "skills/starbucks-parking/collected-at.txt"), SNAPSHOT + "\n");

// ── region markdown ──────────────────────────────────────────────────────────
const fileName = (gugun: string) => `${gugun.replace(/\s+/g, "-")}.md`;
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const key = `${r.sido}/${r.gugun}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
const sidoRank = (s: string) => (SIDO_ORDER.includes(s) ? SIDO_ORDER.indexOf(s) : SIDO_ORDER.length);
const keys = [...groups.keys()].sort((a, b) => {
  const [sa, ga] = a.split("/"), [sb, gb] = b.split("/");
  return sidoRank(sa) - sidoRank(sb) || sa.localeCompare(sb, "ko") || ga.localeCompare(gb, "ko");
});

const regionsDir = path.join(ROOT, "data/regions");
fs.rmSync(regionsDir, { recursive: true, force: true });
for (const key of keys) {
  const [sido, gugun] = key.split("/");
  const list = groups.get(key)!;
  const body = list.map((r) => {
    const meta = [LABEL[r.parsed.parkingType], freeLabel(r.parsed)].filter(Boolean).join(" · ");
    return `## ${r.name} — ${meta}\n- 주소: ${r.address}\n- 주차 안내 원문: ${r.note}\n- 지도: [네이버 지도에서 열기](${r.naver})\n`;
  });
  const file = path.join(regionsDir, sido, fileName(gugun));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `# 스타벅스 ${sido} ${gugun} 주차 정보 (${list.length}곳)\n\n` +
      `${SNAPSHOT} 수집. 분류(무료/조건부 무료/유료)는 원문을 규칙으로 자동 분류한 것이라 틀릴 수 있으니, 답할 때는 "주차 안내 원문"을 근거로 삼으세요.\n\n` +
      body.join("\n"),
  );
}

// ── index ────────────────────────────────────────────────────────────────────
const counts = Object.fromEntries(Object.keys(LABEL).map((t) => [t, rows.filter((r) => r.parsed.parkingType === t).length]));
let index = `# 스타벅스 코리아 매장 주차 정보 (AI 어시스턴트용)

${SNAPSHOT}에 수집한 스타벅스 코리아 매장 중 주차 안내가 있는 ${rows.length.toLocaleString()}곳입니다: 무료 ${counts.FREE} · 조건부 무료 ${counts.VALIDATION} · 유료 ${counts.PAID} · 주차 불가 ${counts.UNAVAILABLE} · 분류 불가 ${counts.UNKNOWN}.
여기 없는 매장은 공식 안내에 주차 정보가 없는 곳입니다("주차 불가"가 아니라 "정보 없음").
광주광역시와 전라남도 매장은 공식 주소(전남광주통합특별시)를 따라 \`전남광주\` 아래에 있습니다. 경기도 광주시는 \`경기/광주시\`입니다.

## 질문에 답하는 방법

1. 질문의 장소(예: 공덕, 판교, 강남역)를 아래 목록에서 찾습니다. 매장 이름이나 동 이름으로 찾고, 경계 근처면 이웃 구·시 파일도 같이 봅니다.
2. 그 지역 파일을 엽니다. 이 저장소 기준 경로는 \`data/regions/<시도>/<구군>.md\`, 원문 주소는 \`${RAW_BASE}/regions/<시도>/<구군>.md\` (구군의 공백은 \`-\`).
3. 주차 되는 곳을 골라 답합니다. 매장마다: 이름, 분류, 무료 시간, 조건(원문 요약), 네이버 지도 링크.
   - "무료 주차" 질문에는 무료와 조건부 무료(음료 구매·차량 등록 시 무료)를 함께, 조건을 밝혀서 답합니다.
   - 지도 링크가 안 보이면 직접 만듭니다: \`https://map.naver.com/p/search/스타벅스%20<매장이름>점\` (예: 스타벅스%20공덕점).
   - 분류는 자동이라 원문과 다르면 원문을 따르고, 수집 시점(${SNAPSHOT})과 매장 확인 권장을 덧붙입니다.
4. 코드를 실행할 수 있으면 전체 표 \`skills/starbucks-parking/stores.csv\`(위도·경도 포함)로 거리 계산을 해도 됩니다.

## 지역 목록 (매장 이름 · 동)
`;
let currentSido = "";
for (const key of keys) {
  const [sido, gugun] = key.split("/");
  const list = groups.get(key)!;
  if (sido !== currentSido) {
    index += `\n### ${sido}\n`;
    currentSido = sido;
  }
  const dongs = [...new Set(list.map((r) => r.dong).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  index += `- [${gugun}](regions/${sido}/${fileName(gugun)}) (${list.length}곳): ${list.map((r) => r.name).join(", ")}${dongs.length ? ` · 동: ${dongs.join(", ")}` : ""}\n`;
}
fs.writeFileSync(path.join(ROOT, "data/index.md"), index);

console.log(`exported ${rows.length} stores into ${keys.length} region files`, counts);
