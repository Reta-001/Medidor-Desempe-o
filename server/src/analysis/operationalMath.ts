import { GLOBAL_SUBSYSTEM, type SubsystemDefinition } from "../config/subsystems.js";
import type { OperationalEventType } from "../events/types.js";

export interface RawOperationalEvent {
  id_subsistema: string;
  id_entidad: string;
  tipo_evento: OperationalEventType;
  timestamp_milisegundos: number;
}

export interface OperationalMetric {
  id_subsistema: string;
  nombre: string;
  configuracion_queues: string;
  capacidad_servidores: number;
  tiempo_observacion_T: number;
  total_A: number;
  total_C: number;
  tiempo_ocupado_B: number;
  tasa_llegada_lambda: number;
  tiempo_servicio_S: number | null;
  tasa_servicio_mu: number | null;
  utilizacion_U: number | null;
  throughput_X: number;
  Lq_promedio_cola: number;
  Wq_tiempo_espera_cola: number;
  L_promedio_sistema: number;
  W_tiempo_sistema: number;
}

interface MetricDefinition {
  id: string;
  name: string;
  queueModel: string;
  servers: number;
  infiniteServers: boolean;
}

interface VisitTimeline {
  entityId: string;
  arrival?: number;
  start?: number;
  departure?: number;
}

interface AreaTotals {
  queueSeconds: number;
  systemSeconds: number;
}

function seconds(ms: number): number {
  return Math.max(ms, 0) / 1000;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(6));
}

function getVisits(timelines: Map<string, VisitTimeline[]>, entityId: string): VisitTimeline[] {
  const visits = timelines.get(entityId);
  if (visits) {
    return visits;
  }
  const next: VisitTimeline[] = [];
  timelines.set(entityId, next);
  return next;
}

function appendVisit(visits: VisitTimeline[], visit: VisitTimeline): VisitTimeline {
  visits.push(visit);
  return visit;
}

function buildVisitTimelines(events: RawOperationalEvent[]): {
  timelines: Map<string, VisitTimeline[]>;
  totalA: number;
  totalC: number;
} {
  const timelines = new Map<string, VisitTimeline[]>();
  let totalA = 0;
  let totalC = 0;

  for (const event of events) {
    const visits = getVisits(timelines, event.id_entidad);

    if (event.tipo_evento === "ARRIVAL") {
      totalA += 1;
      appendVisit(visits, {
        entityId: event.id_entidad,
        arrival: event.timestamp_milisegundos
      });
      continue;
    }

    if (event.tipo_evento === "START_SERVICE") {
      const visit =
        visits.find((candidate) => candidate.arrival !== undefined && candidate.start === undefined) ??
        visits.find((candidate) => candidate.start === undefined) ??
        appendVisit(visits, { entityId: event.id_entidad });
      visit.start = event.timestamp_milisegundos;
      continue;
    }

    totalC += 1;
    const visit =
      visits.find((candidate) => candidate.start !== undefined && candidate.departure === undefined) ??
      visits.find((candidate) => candidate.departure === undefined) ??
      appendVisit(visits, { entityId: event.id_entidad });
    visit.departure = event.timestamp_milisegundos;
  }

  return { timelines, totalA, totalC };
}

function integrateQueueAndSystem(events: RawOperationalEvent[], startMs: number, endMs: number): AreaTotals {
  let queueLength = 0;
  let systemLength = 0;
  let cursor = startMs;
  let queueSeconds = 0;
  let systemSeconds = 0;

  for (const event of events) {
    if (event.timestamp_milisegundos > endMs) {
      break;
    }

    const eventTime = Math.max(event.timestamp_milisegundos, startMs);
    queueSeconds += queueLength * seconds(eventTime - cursor);
    systemSeconds += systemLength * seconds(eventTime - cursor);
    cursor = eventTime;

    if (event.tipo_evento === "ARRIVAL") {
      queueLength += 1;
      systemLength += 1;
    } else if (event.tipo_evento === "START_SERVICE") {
      queueLength = Math.max(0, queueLength - 1);
    } else {
      systemLength = Math.max(0, systemLength - 1);
    }
  }

  queueSeconds += queueLength * seconds(endMs - cursor);
  systemSeconds += systemLength * seconds(endMs - cursor);

  return { queueSeconds, systemSeconds };
}

function clippedSeconds(fromMs: number, toMs: number, startMs: number, endMs: number): number {
  const from = Math.max(fromMs, startMs);
  const to = Math.min(toMs, endMs);
  return seconds(to - from);
}

function computeMetricForEvents(
  definition: MetricDefinition,
  events: RawOperationalEvent[],
  startMs: number,
  endMs: number
): OperationalMetric {
  const periodSeconds = Math.max(seconds(endMs - startMs), 0.001);
  const ordered = [...events].sort(
    (left, right) => left.timestamp_milisegundos - right.timestamp_milisegundos
  );

  const { timelines, totalA, totalC } = buildVisitTimelines(ordered);
  const { queueSeconds, systemSeconds } = integrateQueueAndSystem(ordered, startMs, endMs);
  const completedServiceTimes: number[] = [];
  let busySeconds = 0;

  for (const visits of timelines.values()) {
    for (const visit of visits) {
      if (visit.start === undefined) {
        continue;
      }

      const busyUntil = visit.departure ?? endMs;
      busySeconds += clippedSeconds(visit.start, busyUntil, startMs, endMs);

      if (visit.departure !== undefined) {
        completedServiceTimes.push(seconds(visit.departure - visit.start));
      }
    }
  }

  const lambda = totalA / periodSeconds;
  const throughput = totalC / periodSeconds;
  const serviceTime = completedServiceTimes.length > 0 ? average(completedServiceTimes) : null;
  const serviceRate = serviceTime && serviceTime > 0 ? 1 / serviceTime : null;
  const utilization =
    definition.infiniteServers || definition.servers === 0
      ? null
      : busySeconds / (periodSeconds * definition.servers);
  const lq = queueSeconds / periodSeconds;
  const l = systemSeconds / periodSeconds;
  const wq = lambda > 0 ? lq / lambda : 0;
  const w = lambda > 0 ? l / lambda : 0;

  return {
    id_subsistema: definition.id,
    nombre: definition.name,
    configuracion_queues: definition.queueModel,
    capacidad_servidores: definition.servers,
    tiempo_observacion_T: roundMetric(periodSeconds) ?? periodSeconds,
    total_A: totalA,
    total_C: totalC,
    tiempo_ocupado_B: roundMetric(busySeconds) ?? busySeconds,
    tasa_llegada_lambda: roundMetric(lambda) ?? lambda,
    tiempo_servicio_S: roundMetric(serviceTime),
    tasa_servicio_mu: roundMetric(serviceRate),
    utilizacion_U: roundMetric(utilization),
    throughput_X: roundMetric(throughput) ?? throughput,
    Lq_promedio_cola: roundMetric(lq) ?? lq,
    Wq_tiempo_espera_cola: roundMetric(wq) ?? wq,
    L_promedio_sistema: roundMetric(l) ?? l,
    W_tiempo_sistema: roundMetric(w) ?? w
  };
}

export function computeSubsystemMetric(
  subsystem: SubsystemDefinition,
  events: RawOperationalEvent[],
  startMs: number,
  endMs: number
): OperationalMetric {
  return computeMetricForEvents(
    subsystem,
    events.filter((event) => event.id_subsistema === subsystem.id),
    startMs,
    endMs
  );
}

export function computeGlobalMetric(
  events: RawOperationalEvent[],
  startMs: number,
  endMs: number
): OperationalMetric {
  return computeMetricForEvents(GLOBAL_SUBSYSTEM, events, startMs, endMs);
}
