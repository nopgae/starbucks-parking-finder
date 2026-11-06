// Parser report over the scraped stores.
//   npx ts-node scripts/parking-eval.ts           → class counts + accuracy on the labeled sample
//   npx ts-node scripts/parking-eval.ts --sample  → write a fresh 50-store sample (seed 42) to label
import fs from "fs";
import path from "path";
import { parseParking, ParkingType } from "../src/utils/parkingParser";

const DATA = path.join(__dirname, "../../scraper/data/normalized/stores-parking.json");
const SAMPLE = path.join(__dirname, "../../scraper/data/eval/parking-sample-50.tsv");
const TYPES: ParkingType[] = ["FREE", "VALIDATION", "PAID", "UNAVAILABLE", "UNKNOWN"];

interface Store { storeCode: string; name: string; parking: { info: string | null } | null }
const stores: Store[] = JSON.parse(fs.readFileSync(DATA, "utf-8"));
const typeOf = (s: Store): ParkingType => parseParking(s.parking?.info ?? null).parkingType;

// mulberry32: tiny seeded PRNG so the sample is reproducible without a dependency
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (process.argv.includes("--sample")) {
  if (fs.existsSync(SAMPLE)) throw new Error(`${SAMPLE} exists; delete it to resample`);
  const rand = rng(42);
  const idx = stores.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const rows = idx.slice(0, 50).sort((a, b) => a - b).map((i) => {
    const s = stores[i];
    return [s.storeCode, s.name, typeOf(s), "", (s.parking?.info ?? "").trim()].join("\t");
  });
  fs.mkdirSync(path.dirname(SAMPLE), { recursive: true });
  fs.writeFileSync(SAMPLE, ["storeCode\tname\tbefore\tlabel\traw", ...rows].join("\n") + "\n");
  console.log(`wrote ${SAMPLE}`);
  process.exit(0);
}

const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
for (const s of stores) counts[typeOf(s)]++;
console.log(`all ${stores.length} stores:`, counts);

if (fs.existsSync(SAMPLE)) {
  const rows = fs.readFileSync(SAMPLE, "utf-8").trim().split("\n").slice(1).map((l) => l.split("\t"));
  const labeled = rows.filter((r) => r[3]?.trim());
  if (labeled.length === 0) {
    console.log(`sample: ${rows.length} rows, none labeled yet`);
  } else {
    let before = 0, after = 0;
    for (const [code, name, b, label, raw] of labeled) {
      const want = label.trim().toUpperCase();
      if (!TYPES.includes(want as ParkingType)) throw new Error(`bad label "${label}" for ${code}`);
      // parse the frozen note in the TSV: labels were made against it, and a data refresh may change or drop the store
      const now = parseParking(raw).parkingType;
      if (b === want) before++;
      if (now === want) after++;
      else console.log(`  miss ${code} ${name}: parser ${now}, label ${want}`);
    }
    const pct = (n: number) => `${n}/${labeled.length} (${((100 * n) / labeled.length).toFixed(0)}%)`;
    console.log(`sample accuracy  before: ${pct(before)}  now: ${pct(after)}`);
  }
}
