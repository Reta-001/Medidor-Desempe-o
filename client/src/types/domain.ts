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

export interface PeriodSummary {
  id_periodo: string;
  nombre: string | null;
  timestamp_inicio: number;
  timestamp_fin: number | null;
  estado: "ACTIVO" | "CERRADO";
  metricas: {
    id_subsistema: string;
    tiempo_observacion_T: number;
    total_A: number;
    tasa_llegada_lambda: number;
    tasa_servicio_mu: number | null;
  }[];
}