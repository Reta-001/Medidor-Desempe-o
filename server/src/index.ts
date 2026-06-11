import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";

async function main() {
  await runMigrations();
  const { app, eventQueue } = createApp(pool);
  const server = createServer(app);

  server.listen(env.port, () => {
    console.log(`API lista en http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    console.log("Cerrando servidor...");
    server.close();
    await eventQueue.flush();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  console.error("No se pudo iniciar el servidor:", error);
  await pool.end();
  process.exit(1);
});
