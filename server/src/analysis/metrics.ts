import type { Pool } from "pg";
import { GLOBAL_SUBSYSTEM, SUBSYSTEMS } from "../config/subsystems.js";
import {
  computeGlobalMetric,
  computeSubsystemMetric,
  type OperationalMetric,
  type RawOperationalEvent
} from "./operationalMath.js";

export interface PeriodRow {
  id_periodo: string;
  nombre: string | null;
  timestamp_inicio: number;
  timestamp_fin: number | null;
  estado: "ACTIVO" | "CERRADO";
}

export interface MetricsSnapshot {
  period: PeriodRow;
  generatedAt: number;
  subsystemMetrics: OperationalMetric[];
  globalMetric: OperationalMetric;
}

function asNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  return Number(value);
}

export async function loadPeriod(pool: Pool, periodId: string): Promise<PeriodRow | null> {
  const result = await pool.query(
    `SELECT id_periodo, nombre, timestamp_inicio, timestamp_fin, estado
     FROM periodos_observacion
     WHERE id_periodo = $1`,
    [periodId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id_periodo: row.id_periodo,
    nombre: row.nombre,
    timestamp_inicio: Number(row.timestamp_inicio),
    timestamp_fin: asNumber(row.timestamp_fin),
    estado: row.estado
  };
}

export async function getActivePeriod(pool: Pool): Promise<PeriodRow | null> {
  const result = await pool.query(
    `SELECT id_periodo, nombre, timestamp_inicio, timestamp_fin, estado
     FROM periodos_observacion
     WHERE estado = 'ACTIVO'
     ORDER BY timestamp_inicio DESC
     LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id_periodo: row.id_periodo,
    nombre: row.nombre,
    timestamp_inicio: Number(row.timestamp_inicio),
    timestamp_fin: asNumber(row.timestamp_fin),
    estado: row.estado
  };
}

export async function computeMetricsSnapshot(
  pool: Pool,
  periodId: string,
  overrideEndMs?: number
): Promise<MetricsSnapshot> {
  const period = await loadPeriod(pool, periodId);
  if (!period) {
    throw new Error(`Periodo no encontrado: ${periodId}`);
  }

  // Fetch boundary: use override, period end, or current time just to fetch all relevant events
  const fetchEndMs = overrideEndMs ?? period.timestamp_fin ?? Date.now();
  const eventResult = await pool.query(
    `SELECT id_subsistema, id_entidad, tipo_evento, timestamp_milisegundos
     FROM eventos_operacionales
     WHERE id_periodo = $1
        OR (
          id_periodo IS NULL
          AND timestamp_milisegundos >= $2
          AND timestamp_milisegundos <= $3
        )
     ORDER BY timestamp_milisegundos ASC, id ASC`,
    [periodId, period.timestamp_inicio, fetchEndMs]
  );

  const events: RawOperationalEvent[] = eventResult.rows.map((row) => ({
    id_subsistema: row.id_subsistema,
    id_entidad: row.id_entidad,
    tipo_evento: row.tipo_evento,
    timestamp_milisegundos: Number(row.timestamp_milisegundos)
  }));

  // Determine the observation window end:
  // 1. Explicit override (e.g. when closing a period) → use it
  // 2. Period already closed → use stored timestamp_fin
  // 3. Active period with events → last event timestamp (T only grows when events occur)
  // 4. Active period with no events → period start (T ≈ 0)
  let endMs: number;
  if (overrideEndMs != null) {
    endMs = overrideEndMs;
  } else if (period.timestamp_fin != null) {
    endMs = period.timestamp_fin;
  } else if (events.length > 0) {
    endMs = events[events.length - 1].timestamp_milisegundos;
  } else {
    endMs = period.timestamp_inicio;
  }

  const subsystemMetrics = SUBSYSTEMS.map((subsystem) =>
    computeSubsystemMetric(subsystem, events, period.timestamp_inicio, endMs)
  );
  const globalMetric = computeGlobalMetric(events, period.timestamp_inicio, endMs);

  return {
    period: {
      ...period,
      timestamp_fin: period.timestamp_fin ?? null
    },
    generatedAt: Date.now(),
    subsystemMetrics,
    globalMetric
  };
}

export async function persistMetricsSnapshot(
  pool: Pool,
  snapshot: MetricsSnapshot
): Promise<void> {
  const metrics = [...snapshot.subsystemMetrics, snapshot.globalMetric];
  for (const metric of metrics) {
    await pool.query(
      `INSERT INTO metricas_periodo (
          id_periodo,
          id_subsistema,
          tiempo_observacion_T,
          total_A,
          total_C,
          tiempo_ocupado_B,
          tasa_llegada_lambda,
          tiempo_servicio_S,
          tasa_servicio_mu,
          utilizacion_U,
          throughput_X,
          Lq_promedio_cola,
          Wq_tiempo_espera_cola,
          L_promedio_sistema,
          W_tiempo_sistema
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id_periodo, id_subsistema) DO UPDATE SET
          tiempo_observacion_T = EXCLUDED.tiempo_observacion_T,
          total_A = EXCLUDED.total_A,
          total_C = EXCLUDED.total_C,
          tiempo_ocupado_B = EXCLUDED.tiempo_ocupado_B,
          tasa_llegada_lambda = EXCLUDED.tasa_llegada_lambda,
          tiempo_servicio_S = EXCLUDED.tiempo_servicio_S,
          tasa_servicio_mu = EXCLUDED.tasa_servicio_mu,
          utilizacion_U = EXCLUDED.utilizacion_U,
          throughput_X = EXCLUDED.throughput_X,
          Lq_promedio_cola = EXCLUDED.Lq_promedio_cola,
          Wq_tiempo_espera_cola = EXCLUDED.Wq_tiempo_espera_cola,
          L_promedio_sistema = EXCLUDED.L_promedio_sistema,
          W_tiempo_sistema = EXCLUDED.W_tiempo_sistema,
          calculado_en = now()`,
      [
        snapshot.period.id_periodo,
        metric.id_subsistema,
        metric.tiempo_observacion_T,
        metric.total_A,
        metric.total_C,
        metric.tiempo_ocupado_B,
        metric.tasa_llegada_lambda,
        metric.tiempo_servicio_S,
        metric.tasa_servicio_mu,
        metric.utilizacion_U,
        metric.throughput_X,
        metric.Lq_promedio_cola,
        metric.Wq_tiempo_espera_cola,
        metric.L_promedio_sistema,
        metric.W_tiempo_sistema
      ]
    );
  }
}

export { GLOBAL_SUBSYSTEM };
