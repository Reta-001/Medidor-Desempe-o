import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.pgPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "monitor-operacional-eventos-discretos"
});

pool.on("error", (error) => {
  console.error("[postgres] idle client error", error);
});
