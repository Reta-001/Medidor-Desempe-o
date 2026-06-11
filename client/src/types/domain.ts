export type EventType = "ARRIVAL" | "START_SERVICE" | "DEPARTURE";

export interface Subsystem {
  id: string;
  name: string;
  queueModel: string;
  servers: number;
  infiniteServers: boolean;
}

export interface Period {
  id_periodo: string;
  nombre: string | null;
  timestamp_inicio: number;
  timestamp_fin: number | null;
  estado: "ACTIVO" | "CERRADO";
}

export interface Metric {
  id_subsistema: string;
  nombre: string;
  configuracion_queues: string;
  capacidad_servidores: number;
  tiempo_observacion_t: number;
  total_a: number;
  total_c: number;
  tiempo_ocupado_b: number;
  tasa_llegada_lambda: number;
  tiempo_servicio_s: number | null;
  tasa_servicio_mu: number | null;
  utilizacion_u: number | null;
  throughput_x: number;
  lq_promedio_cola: number;
  wq_tiempo_espera_cola: number;
  l_promedio_sistema: number;
  w_tiempo_sistema: number;
}

export interface MetricsSnapshot {
  period: Period | null;
  generatedAt?: number;
  subsystemMetrics: Metric[];
  globalMetric: Metric | null;
}

export interface EventPayload {
  subsystemId: string;
  entityId: string;
  eventType: EventType;
  timestamp: number;
}

export interface OperationalEventRow {
  id: number;
  id_subsistema: string;
  id_entidad: string;
  tipo_evento: EventType;
  timestamp_milisegundos: number;
  id_periodo: string | null;
  created_at?: string;
}

export interface PoolEntity {
  id: string;
  arrivalTime: number;
  startServiceTime: number | null;
  status: "queue" | "in_service";
}

export interface PeriodSummary {
  id_periodo: string;
  nombre: string | null;
  timestamp_inicio: number;
  timestamp_fin: number | null;
  estado: "ACTIVO" | "CERRADO";
  metricas: {
    id_subsistema: string;
    tiempo_observacion_t: number;
    total_a: number;
    tasa_llegada_lambda: number;
    tasa_servicio_mu: number | null;
  }[];
}
