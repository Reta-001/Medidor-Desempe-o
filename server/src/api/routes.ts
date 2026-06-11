import { Router, type RequestHandler, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { computeMetricsSnapshot, getActivePeriod, persistMetricsSnapshot } from "../analysis/metrics.js";
import { SUBSYSTEMS } from "../config/subsystems.js";
import type { EventWriteQueue } from "../events/eventQueue.js";
import { exportInterarrivalsCsv, exportServiceTimesCsv } from "../exports/promodel.js";
import { startObservationPeriod, stopObservationPeriod } from "../periods/service.js";

const eventSchema = z.object({
  subsystemId: z.string().min(1),
  entityId: z.string().trim().min(1, "id_entidad es obligatorio"),
  eventType: z.enum(["ARRIVAL", "START_SERVICE", "DEPARTURE"]),
  timestamp: z.number().int().positive().optional()
});

const startPeriodSchema = z.object({
  name: z.string().trim().min(1).optional()
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1)
});

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function csvResponse(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export function createApiRouter(pool: Pool, eventQueue: EventWriteQueue): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "monitor-operacional",
      queue: eventQueue.getStatus(),
      timestamp: Date.now()
    });
  });

  router.get("/subsystems", (_req, res) => {
    res.json({ subsystems: SUBSYSTEMS });
  });

  router.get(
    "/periods/current",
    asyncRoute(async (_req, res) => {
      const active = await getActivePeriod(pool);
      res.json({ period: active });
    })
  );

  router.post(
    "/periods/start",
    asyncRoute(async (req, res) => {
      const parsed = startPeriodSchema.parse(req.body ?? {});
      const period = await startObservationPeriod(pool, parsed.name);
      res.status(201).json({ period });
    })
  );

  router.post(
    "/periods/stop",
    asyncRoute(async (_req, res) => {
      const snapshot = await stopObservationPeriod(pool, eventQueue);
      res.json(snapshot);
    })
  );

  // List all periods with summary metrics (λ, μ, T per subsystem)
  router.get(
    "/periods",
    asyncRoute(async (_req, res) => {
      const result = await pool.query(
        `SELECT p.id_periodo, p.nombre, p.timestamp_inicio, p.timestamp_fin, p.estado,
                json_agg(
                  json_build_object(
                    'id_subsistema', m.id_subsistema,
                    'tiempo_observacion_T', m.tiempo_observacion_T,
                    'total_A', m.total_A,
                    'tasa_llegada_lambda', m.tasa_llegada_lambda,
                    'tasa_servicio_mu', m.tasa_servicio_mu
                  ) ORDER BY m.id_subsistema
                ) FILTER (WHERE m.id_subsistema IS NOT NULL) AS metricas
         FROM periodos_observacion p
         LEFT JOIN metricas_periodo m ON p.id_periodo = m.id_periodo
         GROUP BY p.id_periodo
         ORDER BY p.timestamp_inicio DESC`
      );
      const periods = result.rows.map((row: Record<string, unknown>) => ({
        id_periodo: row.id_periodo,
        nombre: row.nombre,
        timestamp_inicio: Number(row.timestamp_inicio),
        timestamp_fin: row.timestamp_fin === null ? null : Number(row.timestamp_fin),
        estado: row.estado,
        metricas: row.metricas ?? []
      }));
      res.json({ periods });
    })
  );

  // Delete a period and all its events + metrics
  router.delete(
    "/periods/:periodId",
    asyncRoute(async (req, res) => {
      const { periodId } = req.params;
      // Don't allow deleting the active period
      const active = await getActivePeriod(pool);
      if (active && active.id_periodo === periodId) {
        res.status(400).json({ error: "No se puede borrar el periodo activo. Detenlo primero." });
        return;
      }
      // Delete events first (no cascade on this FK)
      await pool.query(`DELETE FROM eventos_operacionales WHERE id_periodo = $1`, [periodId]);
      // metricas_periodo has ON DELETE CASCADE, but be explicit
      await pool.query(`DELETE FROM metricas_periodo WHERE id_periodo = $1`, [periodId]);
      const result = await pool.query(`DELETE FROM periodos_observacion WHERE id_periodo = $1`, [periodId]);
      if ((result.rowCount ?? 0) === 0) {
        res.status(404).json({ error: "Periodo no encontrado" });
        return;
      }
      res.json({ deleted: true, periodId });
    })
  );

  router.post(
    "/events",
    asyncRoute(async (req, res) => {
      const active = await getActivePeriod(pool);
      if (!active) {
        res.status(400).json({ error: "No hay periodo activo — presiona Iniciar T primero" });
        return;
      }
      const parsed = eventSchema.parse(req.body);
      const accepted = eventQueue.enqueue(parsed);
      res.status(202).json({
        accepted: true,
        event: accepted,
        queue: eventQueue.getStatus()
      });
    })
  );

  router.post(
    "/events/batch",
    asyncRoute(async (req, res) => {
      const active = await getActivePeriod(pool);
      if (!active) {
        res.status(400).json({ error: "No hay periodo activo — presiona Iniciar T primero" });
        return;
      }
      const parsed = batchSchema.parse(req.body);
      const accepted = parsed.events.map((e) => eventQueue.enqueue(e));
      res.status(202).json({
        accepted: accepted.length,
        events: accepted,
        queue: eventQueue.getStatus()
      });
    })
  );

  router.delete(
    "/subsystems/:subsystemId/events/current",
    asyncRoute(async (req, res) => {
      const { subsystemId } = req.params;
      const active = await getActivePeriod(pool);
      if (!active) {
        res.status(400).json({ error: "No hay periodo activo" });
        return;
      }
      await eventQueue.flush();
      const result = await pool.query(
        `DELETE FROM eventos_operacionales WHERE id_subsistema = $1 AND id_periodo = $2`,
        [subsystemId, active.id_periodo]
      );
      res.json({
        deleted: result.rowCount ?? 0,
        subsystemId,
        periodId: active.id_periodo
      });
    })
  );

  router.get(
    "/metrics/current",
    asyncRoute(async (_req, res) => {
      await eventQueue.flush();
      const active = await getActivePeriod(pool);
      if (!active) {
        res.json({ period: null, subsystemMetrics: [], globalMetric: null });
        return;
      }
      const snapshot = await computeMetricsSnapshot(pool, active.id_periodo);
      await persistMetricsSnapshot(pool, snapshot);
      res.json(snapshot);
    })
  );

  router.get(
    "/metrics/:periodId",
    asyncRoute(async (req, res) => {
      await eventQueue.flush();
      const snapshot = await computeMetricsSnapshot(pool, req.params.periodId);
      await persistMetricsSnapshot(pool, snapshot);
      res.json(snapshot);
    })
  );

  router.get(
    "/exports/interarrivals.csv",
    asyncRoute(async (req, res) => {
      const periodId = String(req.query.periodId ?? "");
      if (!periodId) {
        res.status(400).json({ error: "periodId es obligatorio" });
        return;
      }
      await eventQueue.flush();
      csvResponse(res, `interarrivals_${periodId}.csv`, await exportInterarrivalsCsv(pool, periodId));
    })
  );

  router.get(
    "/exports/services.csv",
    asyncRoute(async (req, res) => {
      const periodId = String(req.query.periodId ?? "");
      if (!periodId) {
        res.status(400).json({ error: "periodId es obligatorio" });
        return;
      }
      await eventQueue.flush();
      csvResponse(res, `services_${periodId}.csv`, await exportServiceTimesCsv(pool, periodId));
    })
  );

  router.get(
    "/queue/status",
    asyncRoute(async (_req, res) => {
      res.json(eventQueue.getStatus());
    })
  );

  router.post(
    "/queue/flush",
    asyncRoute(async (_req, res) => {
      await eventQueue.flush();
      res.json(eventQueue.getStatus());
    })
  );

  return router;
}
