import { FastifyInstance } from "fastify";
import prisma from "../db/client";
import { parseQuery } from "../utils/queryParser";
import { geocode } from "../utils/geocode";
import { ParkingType } from "@prisma/client";

// Extract max free parking hours from condition text
// "구매 시 2시간 가능" → 2, "1시간 무료" → 1, null → null
function extractParkingHours(condition: string | null): number | null {
  if (!condition) return null;

  const korean: Record<string, number> = {
    한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6,
  };

  const digit = condition.match(/(\d+)\s*시간/);
  if (digit) return parseInt(digit[1]);

  const word = condition.match(/(한|두|세|네|다섯|여섯)\s*시간/);
  if (word) return korean[word[1]] ?? null;

  // "무료" without specific hours = treat as unlimited (99)
  if (
    condition.includes("무료") &&
    !condition.match(/\d+시간/) &&
    !condition.match(/(한|두|세|네)시간/)
  )
    return 99;

  return null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function searchRoutes(app: FastifyInstance) {
  // POST /search  — natural language query
  // Body: { query: "강남역에서 두시간 이상 주차되는 스타벅스" }
  app.post<{ Body: { query: string; radius?: number; limit?: number } }>(
    "/search",
    async (req, reply) => {
      const { query, radius = 3, limit = 10 } = req.body ?? {};

      if (!query?.trim()) {
        return reply.status(400).send({ error: "query is required" });
      }

      // 1. Parse the Korean query
      const parsed = parseQuery(query);

      if (!parsed.location) {
        return reply.status(400).send({
          error: "위치를 찾을 수 없어요. 역이름이나 동네 이름을 포함해주세요.",
          parsed,
        });
      }

      // 2. Geocode the location
      const geo = await geocode(parsed.location);

      if (!geo) {
        return reply.status(404).send({
          error: `"${parsed.location}" 위치를 찾을 수 없어요.`,
          parsed,
        });
      }

      // 3. Build DB filter
      const delta = radius / 111;
      const where: Record<string, unknown> = {
        lat: { gte: geo.lat - delta, lte: geo.lat + delta },
        lng: { gte: geo.lng - delta, lte: geo.lng + delta },
      };

      if (parsed.drivethru) where.hasDriveThru = true;

      // Parking type filter
      if (parsed.parkingType === "free") {
        where.parkingType = "FREE" satisfies ParkingType;
      } else if (parsed.parkingType === "paid") {
        where.parkingType = { in: ["PAID", "VALIDATION"] satisfies ParkingType[] };
      } else if (parsed.parkingType === "any" || parsed.minHours) {
        // any parking available (exclude UNAVAILABLE)
        where.hasParking = true;
        where.parkingType = { not: "UNAVAILABLE" satisfies ParkingType };
      }

      // 4. Fetch candidates
      const candidates = await prisma.store.findMany({
        where,
        select: {
          id: true,
          name: true,
          roadAddress: true,
          lat: true,
          lng: true,
          sido: true,
          gugun: true,
          phone: true,
          hasParking: true,
          hasDriveThru: true,
          parkingType: true,
          parkCapacity: true,
          parkLocation: true,
          parkPriceRaw: true,
          parkCondition: true,
          parkPayment: true,
          parkingRaw: true,
        },
      });

      // 5. Haversine filter + distance + parking hours filter
      const results = candidates
        .map((s) => {
          const distanceKm = haversine(geo.lat, geo.lng, s.lat, s.lng);
          const parkingHours = extractParkingHours(s.parkCondition);
          return { ...s, distanceKm, parkingHours };
        })
        .filter((s) => {
          if (s.distanceKm > radius) return false;
          // Duration filter: "두시간 이상" → only stores with >= 2h parking
          if (parsed.minHours !== null) {
            if (s.parkingHours === null) return false;
            if (s.parkingHours < parsed.minHours) return false;
          }
          return true;
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit)
        .map((s) => ({
          ...s,
          distanceKm: Math.round(s.distanceKm * 100) / 100,
          distanceLabel: formatDistance(s.distanceKm),
          parkingSummary: buildParkingSummary(s),
        }));

      return reply.send({
        query,
        parsed,
        geocoded: { location: parsed.location, ...geo },
        total: results.length,
        data: results,
      });
    }
  );
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function buildParkingSummary(s: {
  parkingType: string;
  parkCondition: string | null;
  parkPriceRaw: string | null;
  parkCapacity: string | null;
  parkingHours: number | null;
}): string {
  const typeLabel: Record<string, string> = {
    FREE: "무료 주차",
    PAID: "유료 주차",
    VALIDATION: "조건부 무료",
    UNAVAILABLE: "주차 불가",
    UNKNOWN: "주차 정보 불명확",
  };

  const base = typeLabel[s.parkingType] ?? "주차 정보 없음";

  const parts: string[] = [base];

  if (s.parkingHours && s.parkingHours < 99) {
    parts.push(`최대 ${s.parkingHours}시간`);
  }
  if (s.parkCondition && s.parkingType === "VALIDATION") {
    parts.push(s.parkCondition);
  }
  if (s.parkPriceRaw && s.parkingType === "PAID") {
    parts.push(s.parkPriceRaw);
  }
  if (s.parkCapacity) {
    parts.push(`${s.parkCapacity} 주차 가능`);
  }

  return parts.join(" · ");
}
