import type { Pool } from "pg";
import { toCsv } from "./csv.js";

type EventRow = {
  id_subsistema: string;
  id_entidad: string;
  tipo_evento: "ARRIVAL" | "START_SERVICE" | "DEPARTURE";
  timestamp_milisegundos: number;
};

async function loadPeriodBounds(pool: Pool, periodId: string) {
  const result = await pool.query(
    `SELECT timestamp_inicio, timestamp_fin
     FROM periodos_observacion
     WHERE id_periodo = $1`,
    [periodId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Periodo no encontrado: ${periodId}`);
  }
  return {
    startMs: Number(row.timestamp_inicio),
    endMs: row.timestamp_fin === null ? Date.now() : Number(row.timestamp_fin)
  };
}

async function loadEvents(pool: Pool, periodId: string): Promise<EventRow[]> {
  const bounds = await loadPeriodBounds(pool, periodId);
  const result = await pool.query(
    `SELECT id_subsistema, id_entidad, tipo_evento, timestamp_milisegundos
     FROM eventos_operacionales
     WHERE id_periodo = $1
        OR (
          id_periodo IS NULL
          AND timestamp_milisegundos >= $2
          AND timestamp_milisegundos <= $3
        )
     ORDER BY timestamp_milisegundos ASC, id ASC`,
    [periodId, bounds.startMs, bounds.endMs]
  );
  return result.rows.map((row) => ({
    id_subsistema: row.id_subsistema,
    id_entidad: row.id_entidad,
    tipo_evento: row.tipo_evento,
    timestamp_milisegundos: Number(row.timestamp_milisegundos)
  }));
}

export async function exportInterarrivalsCsv(pool: Pool, periodId: string): Promise<string> {
  const events = (await loadEvents(pool, periodId)).filter(
    (event) => event.id_subsistema === "SC" && event.tipo_evento === "ARRIVAL"
  );
  const rows = events.map((event, index) => {
    const previous = events[index - 1];
    const interarrival = previous
      ? (event.timestamp_milisegundos - previous.timestamp_milisegundos) / 1000
      : "";
    return [
      index + 1,
      event.id_entidad,
      event.timestamp_milisegundos,
      interarrival === "" ? "" : Number(interarrival.toFixed(6))
    ];
  });
  return toCsv(["secuencia", "id_entidad", "arrival_timestamp_ms", "interarrival_seconds"], rows);
}

export async function exportServiceTimesCsv(pool: Pool, periodId: string): Promise<string> {
  const events = await loadEvents(pool, periodId);
  const starts = new Map<string, EventRow[]>();
  const rows: unknown[][] = [];

  for (const event of events) {
    const key = `${event.id_subsistema}:${event.id_entidad}`;
    if (event.tipo_evento === "START_SERVICE") {
      const queue = starts.get(key) ?? [];
      queue.push(event);
      starts.set(key, queue);
      continue;
    }

    if (event.tipo_evento !== "DEPARTURE") {
      continue;
    }

    const queue = starts.get(key) ?? [];
    const start = queue.shift();
    if (!start) {
      continue;
    }
    rows.push([
      event.id_subsistema,
      event.id_entidad,
      start.timestamp_milisegundos,
      event.timestamp_milisegundos,
      Number(((event.timestamp_milisegundos - start.timestamp_milisegundos) / 1000).toFixed(6))
    ]);
  }

  return toCsv(
    [
      "id_subsistema",
      "id_entidad",
      "start_service_timestamp_ms",
      "departure_timestamp_ms",
      "service_time_seconds"
    ],
    rows
  );
}
