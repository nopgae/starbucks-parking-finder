import Fastify from "fastify";
import cors from "@fastify/cors";
import { storeRoutes } from "./routes/stores";

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: true });
  await app.register(storeRoutes);

  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  const port = parseInt(process.env.PORT ?? "3000");
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API running on http://localhost:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
