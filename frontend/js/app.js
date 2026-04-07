// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3000";

// ── Parking type config ───────────────────────────────────────────────────────
const PARKING_CONFIG = {
  FREE:        { emoji: "🟢", label: "무료 주차",   color: "#00a862" },
  VALIDATION:  { emoji: "🔵", label: "조건부 무료", color: "#4285f4" },
  PAID:        { emoji: "🟠", label: "유료 주차",   color: "#f57c00" },
  UNAVAILABLE: { emoji: "⚫", label: "주차 불가",   color: "#9e9e9e" },
  UNKNOWN:     { emoji: "⚪", label: "정보 없음",   color: "#bdbdbd" },
};

// ── State ─────────────────────────────────────────────────────────────────────
let map = null;
let markers = [];
let allStores = [];
let activeFilter = "all";
let userLocation = null;

// ── Google Maps callback ──────────────────────────────────────────────────────
window.onMapsReady = function () { initMap(); };

// ── Init map ──────────────────────────────────────────────────────────────────
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 37.5665, lng: 126.9780 }, // Seoul city hall
    zoom: 13,
    mapId: "DEMO_MAP_ID",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  map.addListener("idle", () => {
    const center = map.getCenter();
    loadNearbyStores(center.lat(), center.lng());
  });
}

// ── Load stores from API ──────────────────────────────────────────────────────
async function loadNearbyStores(lat, lng, radius = 5) {
  try {
    const params = new URLSearchParams({
      lat, lng, radius,
      limit: 100,
      ...(activeFilter !== "all" && activeFilter !== "drive"
        ? { parking: activeFilter.toLowerCase() }
        : {}),
      ...(activeFilter === "drive" ? { drive_thru: "true" } : {}),
    });

    const res = await fetch(`${API_BASE}/stores/nearby?${params}`);
    const data = await res.json();
    allStores = data.data ?? [];
    renderMarkers(allStores);
  } catch (err) {
    console.error("Failed to load stores:", err);
  }
}

// ── Render markers ────────────────────────────────────────────────────────────
function renderMarkers(stores) {
  markers.forEach((m) => { m.map = null; });
  markers = [];

  stores.forEach((store) => {
    const cfg = PARKING_CONFIG[store.parkingType] ?? PARKING_CONFIG.UNKNOWN;

    const pin = document.createElement("div");
    pin.style.cssText = `
      background:${cfg.color};
      color:#fff;
      border-radius:50%;
      width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;
      font-size:15px;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
      border:2px solid #fff;
      cursor:pointer;
    `;
    pin.textContent = cfg.emoji;

    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: store.lat, lng: store.lng },
      map,
      content: pin,
      title: store.name,
    });

    marker.addListener("click", () => openDetail(store));
    markers.push(marker);
  });
}

// ── Open detail sheet ─────────────────────────────────────────────────────────
async function openDetail(store) {
  const res = await fetch(`${API_BASE}/stores/${store.id}`);
  const full = await res.json();

  const cfg = PARKING_CONFIG[full.parkingType] ?? PARKING_CONFIG.UNKNOWN;

  const parkingCard = full.hasParking
    ? `<div class="parking-card">
        <div class="parking-card-title">${cfg.emoji} ${cfg.label}</div>
        ${full.parkCondition ? `<div class="parking-row"><span class="label">조건</span><span>${full.parkCondition}</span></div>` : ""}
        ${full.parkPriceRaw  ? `<div class="parking-row"><span class="label">요금</span><span>${full.parkPriceRaw}</span></div>` : ""}
        ${full.parkCapacity  ? `<div class="parking-row"><span class="label">주차 대수</span><span>${full.parkCapacity}</span></div>` : ""}
        ${full.parkLocation  ? `<div class="parking-row"><span class="label">위치</span><span>${full.parkLocation}</span></div>` : ""}
        ${full.parkPayment   ? `<div class="parking-row"><span class="label">결제</span><span>${full.parkPayment}</span></div>` : ""}
      </div>`
    : `<div class="no-parking-card">⚫ 이 매장은 주차 공간이 없습니다</div>`;

  const googleMapUrl = `https://www.google.com/maps/search/${encodeURIComponent(full.name + " 스타벅스")}`;

  document.getElementById("detail-content").innerHTML = `
    <div class="detail-name">${full.name}</div>
    <div class="detail-addr">${full.roadAddress || full.address}</div>
    ${parkingCard}
    <div class="detail-actions">
      <button class="action-btn btn-naver" onclick="window.open('${googleMapUrl}','_blank')">🗺 구글 지도</button>
      <button class="action-btn btn-call" onclick="window.location.href='tel:${full.phone}'">📞 전화</button>
      <button class="action-btn btn-report" onclick="openReport(${full.id})">신고</button>
    </div>
    ${full.notice ? `<div class="detail-notice">💬 ${full.notice}</div>` : ""}
  `;

  document.getElementById("detail-sheet").classList.remove("hidden");
  map.panTo({ lat: full.lat, lng: full.lng });
}

// ── Natural language search ───────────────────────────────────────────────────
async function runSearch(query) {
  if (!query.trim()) return;

  document.getElementById("search-btn").textContent = "...";

  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, radius: 5 }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "검색 중 오류가 발생했어요.");
      return;
    }

    if (data.geocoded) {
      map.setCenter({ lat: data.geocoded.lat, lng: data.geocoded.lng });
      map.setZoom(14);
    }

    allStores = data.data ?? [];
    renderMarkers(allStores);
    showResultPanel(data);
  } catch (err) {
    console.error(err);
    alert("검색 중 오류가 발생했어요.");
  } finally {
    document.getElementById("search-btn").textContent = "검색";
  }
}

// ── Result panel ──────────────────────────────────────────────────────────────
function showResultPanel(data) {
  const panel = document.getElementById("result-panel");
  const list = document.getElementById("result-list");
  const count = document.getElementById("result-count");

  count.textContent = `${data.total}개 매장 발견 · "${data.parsed?.location ?? ""}" 근처`;

  list.innerHTML = data.data.map((s) => {
    const cfg = PARKING_CONFIG[s.parkingType] ?? PARKING_CONFIG.UNKNOWN;
    return `
      <div class="result-item" onclick="openDetail(${JSON.stringify(s).replace(/"/g, "&quot;")})">
        <div class="result-badge badge-${s.parkingType}">${cfg.emoji}</div>
        <div class="result-info">
          <div class="result-name">${s.name}</div>
          <div class="result-addr">${s.roadAddress || s.address}</div>
          <div class="result-parking">${s.parkingSummary ?? cfg.label}</div>
        </div>
        <div class="result-distance">${s.distanceLabel ?? ""}</div>
      </div>`;
  }).join("");

  panel.classList.remove("hidden");
}

// ── Report ────────────────────────────────────────────────────────────────────
async function openReport(storeId) {
  const note = prompt("어떤 점이 잘못됐나요? (선택사항)");
  if (note === null) return;

  const type = confirm("정보가 없어진 건가요?\n확인 = 정보없음, 취소 = 정보가 틀림")
    ? "OUTDATED"
    : "INCORRECT";

  await fetch(`${API_BASE}/stores/${storeId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, note }),
  });
  alert("신고가 접수됐어요. 감사합니다! 🙏");
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById("search-btn").addEventListener("click", () => {
  runSearch(document.getElementById("search-input").value);
});

document.getElementById("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch(e.target.value);
});

document.querySelectorAll(".filter-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.type;

    if (map) {
      const c = map.getCenter();
      loadNearbyStores(c.lat(), c.lng());
    }
  });
});

document.getElementById("locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) return alert("위치 서비스를 지원하지 않는 브라우저예요.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setCenter(userLocation);
      map.setZoom(14);
      loadNearbyStores(userLocation.lat, userLocation.lng);
    },
    () => alert("위치 권한이 필요해요.")
  );
});

document.getElementById("result-close").addEventListener("click", () => {
  document.getElementById("result-panel").classList.add("hidden");
});

document.getElementById("detail-handle").addEventListener("click", () => {
  document.getElementById("detail-sheet").classList.add("hidden");
});
