import { FastifyInstance } from "fastify";
import prisma from "../db/client";
import { ParkingType } from "@prisma/client";

export async function storeRoutes(app: FastifyInstance) {
  // GET /stores — list with filters
  app.get<{
    Querystring: {
      sido?: string;
      gugun?: string;
      parking?: string;
      drive_thru?: string;
      open_now?: string;
      limit?: string;
      offset?: string;
    };
  }>("/stores", async (req, reply) => {
    const { sido, gugun, parking, drive_thru, limit = "20", offset = "0" } = req.query;

    const where: Record<string, unknown> = {};

    if (sido) where.sido = { contains: sido };
    if (gugun) where.gugun = { contains: gugun };
    if (drive_thru === "true") where.hasDriveThru = true;

    if (parking) {
      if (parking === "any") {
        where.hasParking = true;
      } else {
        const typeMap: Record<string, ParkingType> = {
          free: "FREE",
          paid: "PAID",
          validation: "VALIDATION",
        };
        const mapped = typeMap[parking.toLowerCase()];
        if (mapped) where.parkingType = mapped;
      }
    }

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        select: storeSelect,
        take: Math.min(parseInt(limit), 100),
        skip: parseInt(offset),
        orderBy: { name: "asc" },
      }),
      prisma.store.count({ where }),
    ]);

    return reply.send({ total, data: stores });
  });

  // GET /stores/nearby — find stores near a coordinate
  app.get<{
    Querystring: {
      lat: string;
      lng: string;
      radius?: string;
      parking?: string;
      drive_thru?: string;
      limit?: string;
    };
  }>("/stores/nearby", async (req, reply) => {
    const { lat, lng, radius = "3", parking, drive_thru, limit = "20" } = req.query;

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusKm = parseFloat(radius);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return reply.status(400).send({ error: "lat and lng are required" });
    }

    // Bounding box pre-filter (1 degree ≈ 111km)
    const delta = radiusKm / 111;
    const where: Record<string, unknown> = {
      lat: { gte: latNum - delta, lte: latNum + delta },
      lng: { gte: lngNum - delta, lte: lngNum + delta },
    };

    if (drive_thru === "true") where.hasDriveThru = true;

    if (parking) {
      if (parking === "any") {
        where.hasParking = true;
      } else {
        const typeMap: Record<string, ParkingType> = {
          free: "FREE",
          paid: "PAID",
          validation: "VALIDATION",
        };
        const mapped = typeMap[parking.toLowerCase()];
        if (mapped) where.parkingType = mapped;
      }
    }

    const candidates = await prisma.store.findMany({
      where,
      select: storeSelect,
    });

    // Precise haversine filter + sort by distance
    const withDistance = candidates
      .map((s) => ({
        ...s,
        distanceKm: haversine(latNum, lngNum, s.lat, s.lng),
      }))
      .filter((s) => s.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, parseInt(limit));

    return reply.send({ total: withDistance.length, data: withDistance });
  });

  // GET /stores/:id — single store detail
  app.get<{ Params: { id: string } }>("/stores/:id", async (req, reply) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid id" });

    const store = await prisma.store.findUnique({
      where: { id },
      include: { reports: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    if (!store) return reply.status(404).send({ error: "Store not found" });
    return reply.send(store);
  });

  // POST /stores/:id/report — user reports incorrect parking info
  app.post<{
    Params: { id: string };
    Body: { type: string; note?: string };
  }>("/stores/:id/report", async (req, reply) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid id" });

    const { type, note } = req.body ?? {};
    const validTypes = ["INCORRECT", "OUTDATED", "NEW_INFO"];
    if (!validTypes.includes(type)) {
      return reply.status(400).send({ error: `type must be one of: ${validTypes.join(", ")}` });
    }

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return reply.status(404).send({ error: "Store not found" });

    const report = await prisma.parkingReport.create({
      data: { storeId: id, type: type as "INCORRECT" | "OUTDATED" | "NEW_INFO", note },
    });

    return reply.status(201).send(report);
  });
}

// Haversine distance in km
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

const storeSelect = {
  id: true,
  storeCode: true,
  name: true,
  address: true,
  roadAddress: true,
  lat: true,
  lng: true,
  sido: true,
  gugun: true,
  phone: true,
  hasDriveThru: true,
  hasParking: true,
  parkingType: true,
  parkCapacity: true,
  parkLocation: true,
  parkPriceRaw: true,
  parkCondition: true,
  parkPayment: true,
  parkLastVerified: true,
  notice: true,
};
