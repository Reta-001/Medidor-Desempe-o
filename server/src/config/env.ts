import dotenv from "dotenv";

dotenv.config();

const fallbackDatabaseUrl =
  "postgresql://postgres:cris2001@localhost:5432/desempe%C3%B1o";

export const env = {
  port: Number(process.env.PORT ?? 4100),
  databaseUrl: process.env.DATABASE_URL ?? fallbackDatabaseUrl,
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  pgPoolMax: Number(process.env.PG_POOL_MAX ?? 12)
};
