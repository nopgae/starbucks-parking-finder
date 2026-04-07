import { chromium, Route, Request } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://www.starbucks.co.kr/store/store_map.do";
const RAW_DIR = path.resolve(__dirname, "../data/raw");

// All Korean provinces (시/도)
const SIDO_LIST = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  timestamp: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false, // visible so you can see what's happening
    slowMo: 300,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "ko-KR",
  });

  const page = await context.newPage();

  // --- Intercept all XHR/fetch requests ---
  const captured: CapturedRequest[] = [];

  page.on("request", (req: Request) => {
    const resourceType = req.resourceType();
    if (resourceType === "xhr" || resourceType === "fetch") {
      console.log(`[REQUEST] ${req.method()} ${req.url()}`);
    }
  });

  page.on("response", async (res) => {
    const req = res.request();
    const resourceType = req.resourceType();

    if (resourceType !== "xhr" && resourceType !== "fetch") return;

    const url = req.url();

    // Skip Kakao map tile/asset calls — we only want Starbucks data calls
    if (
      url.includes("kakao") ||
      url.includes("daumcdn") ||
      url.includes("analytics") ||
      url.includes("beacon")
    ) {
      return;
    }

    let body: unknown = null;
    try {
      const text = await res.text();
      body = JSON.parse(text);
    } catch {
      try {
        body = await res.text();
      } catch {
        body = null;
      }
    }

    const entry: CapturedRequest = {
      url,
      method: req.method(),
      headers: req.headers(),
      postData: req.postData(),
      responseStatus: res.status(),
      responseHeaders: res.headers(),
      responseBody: body,
      timestamp: new Date().toISOString(),
    };

    captured.push(entry);
    console.log(`[CAPTURED] ${req.method()} ${url} → ${res.status()}`);

    // Log any response that looks like store data
    const bodyStr = JSON.stringify(body).toLowerCase();
    if (
      bodyStr.includes("store") ||
      bodyStr.includes("park") ||
      bodyStr.includes("주차") ||
      bodyStr.includes("lat") ||
      bodyStr.includes("xcoord")
    ) {
      console.log(`  *** POTENTIAL STORE DATA FOUND ***`);
      console.log(`  URL: ${url}`);
      console.log(`  POST params: ${req.postData()}`);
      console.log(`  Response preview: ${bodyStr.slice(0, 300)}`);
    }
  });

  // --- Navigate to store map ---
  console.log("\n[INFO] Loading Starbucks Korea store map...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  // --- Trigger sido dropdown interactions ---
  console.log("\n[INFO] Iterating over sido (province) list...");

  for (const sido of SIDO_LIST) {
    console.log(`\n[SIDO] Selecting: ${sido}`);

    try {
      // Look for the sido select element
      const sidoSelect = page.locator("select[name='sido'], #sido, .sido_sel").first();
      await sidoSelect.selectOption({ label: sido });
      await sleep(1500);

      // Wait for gugun (district) dropdown to populate
      const gugunSelect = page.locator("select[name='gugun'], #gugun, .gugun_sel").first();
      const gugunOptions = await gugunSelect.locator("option").allTextContents();
      console.log(`  Districts found: ${gugunOptions.slice(1, 4).join(", ")}...`);

      // Select first real district (skip the placeholder "전체" or blank)
      const firstGugun = gugunOptions.find(
        (o) => o.trim() && o.trim() !== "전체" && o.trim() !== "선택"
      );

      if (firstGugun) {
        await gugunSelect.selectOption({ label: firstGugun.trim() });
        await sleep(1500);
      }

      // Try clicking a search button if present
      const searchBtn = page.locator("button.btn_search, .search_btn, #btnSearch").first();
      const searchBtnVisible = await searchBtn.isVisible().catch(() => false);
      if (searchBtnVisible) {
        await searchBtn.click();
        await sleep(1500);
      }
    } catch (err) {
      console.log(`  [WARN] Could not interact with ${sido}: ${(err as Error).message}`);
    }
  }

  // --- Save all captured requests ---
  const outputPath = path.join(RAW_DIR, "intercepted-requests.json");
  fs.writeFileSync(outputPath, JSON.stringify(captured, null, 2), "utf-8");
  console.log(`\n[DONE] Captured ${captured.length} requests → ${outputPath}`);

  // --- Print summary of unique endpoints ---
  const uniqueUrls = [...new Set(captured.map((r) => `${r.method} ${r.url}`))];
  console.log("\n[SUMMARY] Unique Starbucks endpoints captured:");
  uniqueUrls.forEach((u) => console.log(`  ${u}`));

  await browser.close();
}

run().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
