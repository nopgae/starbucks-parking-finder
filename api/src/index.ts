import Fastify from "fastify";
import cors from "@fastify/cors";
import { storeRoutes } from "./routes/stores";
import { searchRoutes } from "./routes/search";
import { rateLimiter } from "./utils/rateLimiter";

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: true });
  await app.register(storeRoutes);
  await app.register(searchRoutes);

  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  // API usage monitor — shows daily call counts vs free-tier limits
  app.get("/status", async () => ({
    ts: new Date().toISOString(),
    apis: rateLimiter.getAll(),
  }));

  const port = parseInt(process.env.PORT ?? "3000");
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API running on http://localhost:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
