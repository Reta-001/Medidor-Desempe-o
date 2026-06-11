import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { computeMetricsSnapshot, getActivePeriod, persistMetricsSnapshot } from "../analysis/metrics.js";
import type { EventWriteQueue } from "../events/eventQueue.js";

export async function startObservationPeriod(pool: Pool, name?: string) {
  const active = await getActivePeriod(pool);
  if (active) {
    return active;
  }

  const id = randomUUID();
  const startedAt = Date.now();
  const result = await pool.query(
    `INSERT INTO periodos_observacion (id_periodo, nombre, timestamp_inicio, estado)
     VALUES ($1, $2, $3, 'ACTIVO')
     RETURNING id_periodo, nombre, timestamp_inicio, timestamp_fin, estado`,
    [id, name ?? null, startedAt]
  );
  const row = result.rows[0];
  return {
    id_periodo: row.id_periodo,
    nombre: row.nombre,
    timestamp_inicio: Number(row.timestamp_inicio),
    timestamp_fin: row.timestamp_fin === null ? null : Number(row.timestamp_fin),
    estado: row.estado
  };
}

export async function stopObservationPeriod(pool: Pool, eventQueue: EventWriteQueue) {
  const active = await getActivePeriod(pool);
  if (!active) {
    throw new Error("No hay periodo ACTIVO para detener");
  }

  await eventQueue.flush();
  const endedAt = Date.now();
  await pool.query(
    `UPDATE periodos_observacion
     SET estado = 'CERRADO', timestamp_fin = $2
     WHERE id_periodo = $1`,
    [active.id_periodo, endedAt]
  );

  const snapshot = await computeMetricsSnapshot(pool, active.id_periodo, endedAt);
  await persistMetricsSnapshot(pool, snapshot);
  return snapshot;
}
