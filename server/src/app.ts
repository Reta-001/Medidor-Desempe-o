import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Pool } from "pg";
import { env } from "./config/env.js";
import { EventWriteQueue } from "./events/eventQueue.js";
import { createApiRouter } from "./api/routes.js";

export function createApp(pool: Pool, eventQueue = new EventWriteQueue(pool)) {
  const app = express();

  app.use(
    cors({
      origin: [env.clientOrigin, "http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5175", "http://localhost:5175"],
      credentials: false
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRouter(pool, eventQueue));

  app.get("/", (_req, res) => {
    res.json({
      service: "monitor-operacional-eventos-discretos",
      api: "/api/health"
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const status = message.includes("obligatorio") || message.includes("desconocido") ? 400 : 500;
    if (status >= 500) {
      console.error("[api] error", error);
    }
    res.status(status).json({ error: message });
  };

  app.use(errorHandler);

  return { app, eventQueue };
}
