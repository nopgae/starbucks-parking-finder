import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parseParking } from "../src/utils/parkingParser";

const prisma = new PrismaClient();

interface RawStore {
  s_code: string;
  s_biz_code: string;
  s_name: string;
  addr: string;
  doro_address: string;
  lat: string;
  lot: string;
  sido_name: string;
  sido_code: string;
  gugun_name: string;
  gugun_code: string;
  tel: string;
  park_info: string | null;
  notice: string | null;
  theme_state: string | null;
}

async function main() {
  const enrichedPath = path.resolve(
    __dirname,
    "../../scraper/data/raw/stores-enriched.json"
  );

  if (!fs.existsSync(enrichedPath)) {
    console.error("[ERROR] stores-enriched.json not found.");
    console.error("        Run: cd scraper && npm run enrich");
    process.exit(1);
  }

  const raw: RawStore[] = JSON.parse(fs.readFileSync(enrichedPath, "utf-8"));
  console.log(`[INFO] Seeding ${raw.length} stores...`);

  let inserted = 0;
  let skipped = 0;

  for (const store of raw) {
    if (!store.s_code || !store.s_biz_code) {
      skipped++;
      continue;
    }

    const theme = store.theme_state ?? "";
    const parsed = parseParking(store.park_info);

    await prisma.store.upsert({
      where: { storeCode: store.s_code },
      create: {
        storeCode: store.s_code,
        bizCode: store.s_biz_code,
        name: store.s_name ?? "",
        address: store.addr ?? "",
        roadAddress: store.doro_address ?? "",
        lat: parseFloat(store.lat) || 0,
        lng: parseFloat(store.lot) || 0,
        sido: store.sido_name ?? "",
        sidoCode: store.sido_code ?? "",
        gugun: store.gugun_name ?? "",
        gugunCode: store.gugun_code ?? "",
        phone: store.tel ?? "",
        notice: store.notice,
        themeState: store.theme_state,
        hasDriveThru: theme.includes("@T01") || theme.includes("T01@"),
        hasParking: parsed.hasParking,
        parkingRaw: store.park_info,
        parkingType: parsed.parkingType,
        parkCapacity: parsed.parkCapacity,
        parkLocation: parsed.parkLocation,
        parkPriceRaw: parsed.parkPriceRaw,
        parkCondition: parsed.parkCondition,
        parkPayment: parsed.parkPayment,
        parkLastVerified: new Date(),
      },
      update: {
        name: store.s_name ?? "",
        address: store.addr ?? "",
        roadAddress: store.doro_address ?? "",
        lat: parseFloat(store.lat) || 0,
        lng: parseFloat(store.lot) || 0,
        notice: store.notice,
        themeState: store.theme_state,
        hasDriveThru: theme.includes("@T01") || theme.includes("T01@"),
        hasParking: parsed.hasParking,
        parkingRaw: store.park_info,
        parkingType: parsed.parkingType,
        parkCapacity: parsed.parkCapacity,
        parkLocation: parsed.parkLocation,
        parkPriceRaw: parsed.parkPriceRaw,
        parkCondition: parsed.parkCondition,
        parkPayment: parsed.parkPayment,
        parkLastVerified: new Date(),
      },
    });

    inserted++;
    if (inserted % 200 === 0) {
      console.log(`  ${inserted}/${raw.length} seeded...`);
    }
  }

  const counts = await prisma.store.groupBy({
    by: ["parkingType"],
    _count: true,
  });

  console.log(`\n[DONE] Seeded ${inserted} stores (skipped ${skipped})`);
  console.log("\n[STATS] Parking breakdown:");
  counts.forEach((c) => console.log(`  ${c.parkingType}: ${c._count}`));
}

main()
  .catch((e) => {
    console.error("[FATAL]", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
