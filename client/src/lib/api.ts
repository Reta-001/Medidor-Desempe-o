import type {
  Metric,
  MetricsSnapshot,
  OperationalEventRow,
  Period,
  PeriodSummary,
  Subsystem
} from "../types/domain";
import { getSupabaseClient, hasSupabaseConfig } from "./supabase";

const SUBSYSTEMS: Subsystem[] = [
  { id: "SC", name: "Entrada", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "BC1", name: "Banos 1", queueModel: "M/M/7", servers: 7, infiniteServers: false },
  { id: "BC2", name: "Banos 2", queueModel: "M/M/7", servers: 7, infiniteServers: false },
  { id: "AC1", name: "Guardarropa 1", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "AC2", name: "Guardarropa 2", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "AC3", name: "Guardarropa 3", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "DC", name: "Pista de baile", queueModel: "M/M/inf", servers: 0, infiniteServers: true },
  { id: "CC1", name: "Barra 1", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "CC2", name: "Barra 2", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "CC3", name: "Barra 3", queueModel: "M/M/1", servers: 1, infiniteServers: false }
];

type RealtimeStatus = "CONECTANDO" | "CONECTADO" | "RECONECTANDO" | "ERROR";

function mapPeriod(row: Record<string, unknown>): Period {
  return {
    id_periodo: String(row.id_periodo),
    nombre: row.nombre === null ? null : String(row.nombre),
    timestamp_inicio: Number(row.timestamp_inicio),
    timestamp_fin: row.timestamp_fin === null ? null : Number(row.timestamp_fin),
    estado: row.estado as Period["estado"]
  };
}

function mapEvent(row: Record<string, unknown>): OperationalEventRow {
  return {
    id: Number(row.id),
    id_subsistema: String(row.id_subsistema),
    id_entidad: String(row.id_entidad),
    tipo_evento: row.tipo_evento as OperationalEventRow["tipo_evento"],
    timestamp_milisegundos: Number(row.timestamp_milisegundos),
    id_periodo: row.id_periodo === null ? null : String(row.id_periodo),
    created_at: row.created_at === undefined ? undefined : String(row.created_at)
  };
}

function mapMetric(row: Record<string, unknown>): PeriodSummary["metricas"][number] {
  return {
    id_subsistema: String(row.id_subsistema),
    tiempo_observacion_t: Number(row.tiempo_observacion_t),
    total_a: Number(row.total_a),
    total_c: Number(row.total_c),
    tasa_llegada_lambda: Number(row.tasa_llegada_lambda),
    tasa_servicio_mu: row.tasa_servicio_mu === null ? null : Number(row.tasa_servicio_mu)
  };
}

function metricToRow(periodId: string, metric: Metric) {
  return {
    id_periodo: periodId,
    id_subsistema: metric.id_subsistema,
    tiempo_observacion_t: metric.tiempo_observacion_t,
    total_a: metric.total_a,
    total_c: metric.total_c,
    tiempo_ocupado_b: metric.tiempo_ocupado_b,
    tasa_llegada_lambda: metric.tasa_llegada_lambda,
    tiempo_servicio_s: metric.tiempo_servicio_s,
    tasa_servicio_mu: metric.tasa_servicio_mu,
    utilizacion_u: metric.utilizacion_u,
    throughput_x: metric.throughput_x,
    lq_promedio_cola: metric.lq_promedio_cola,
    wq_tiempo_espera_cola: metric.wq_tiempo_espera_cola,
    l_promedio_sistema: metric.l_promedio_sistema,
    w_tiempo_sistema: metric.w_tiempo_sistema
  };
}

function assertNoError(error: unknown): asserts error is null {
  if (!error) {
    return;
  }

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  throw new Error(message);
}

async function saveMetricsSnapshot(snapshot: MetricsSnapshot): Promise<void> {
  const periodId = snapshot.period?.id_periodo;
  const globalMetric = snapshot.globalMetric;
  if (!periodId || !globalMetric) {
    return;
  }

  const supabase = getSupabaseClient();
  const rows = [...snapshot.subsystemMetrics, globalMetric].map((metric) =>
    metricToRow(periodId, metric)
  );
  const { error } = await supabase
    .from("metricas_periodo")
    .upsert(rows, { onConflict: "id_periodo,id_subsistema" });
  assertNoError(error);
}

async function getEventsForPeriod(periodId: string): Promise<OperationalEventRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("eventos_operacionales")
    .select("*")
    .eq("id_periodo", periodId)
    .order("timestamp_milisegundos", { ascending: true })
    .order("id", { ascending: true });
  assertNoError(error);

  return ((data ?? []) as Record<string, unknown>[]).map(mapEvent);
}

let serverTimeOffset = 0;

export const api = {
  isConfigured: hasSupabaseConfig,

  getServerTime(): number {
    return Date.now() + serverTimeOffset;
  },

  async syncServerTime(): Promise<number> {
    if (!hasSupabaseConfig) {
      return 0;
    }
    try {
      const t0 = Date.now();
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("current_epoch_ms");
      assertNoError(error);
      const t1 = Date.now();
      const dbTime = Number(data);
      const latency = (t1 - t0) / 2;
      serverTimeOffset = Math.round(dbTime - (t1 - latency));
      console.log(
        `[Clock Sync] Offset: ${serverTimeOffset}ms (latency: ${latency}ms, server: ${dbTime}, local: ${t1})`
      );
      return serverTimeOffset;
    } catch (err) {
      console.error("Failed to sync server time, using local clock:", err);
      return 0;
    }
  },

  async getSubsystems(): Promise<Subsystem[]> {
    return SUBSYSTEMS;
  },

  async getCurrentPeriod(): Promise<Period | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("periodos_observacion")
      .select("id_periodo,nombre,timestamp_inicio,timestamp_fin,estado")
      .eq("estado", "ACTIVO")
      .order("timestamp_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertNoError(error);

    return data ? mapPeriod(data as Record<string, unknown>) : null;
  },

  async getLiveState(): Promise<{ period: Period | null; events: OperationalEventRow[] }> {
    const period = await this.getCurrentPeriod();
    if (!period) {
      return { period: null, events: [] };
    }

    return {
      period,
      events: await getEventsForPeriod(period.id_periodo)
    };
  },

  async startPeriod(name?: string): Promise<Period> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("start_observation_period", {
      p_name: name ?? null
    });
    assertNoError(error);

    return mapPeriod(data as Record<string, unknown>);
  },

  async stopPeriod(snapshot: MetricsSnapshot, timestamp: number): Promise<MetricsSnapshot> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("stop_observation_period", {
      p_timestamp: timestamp
    });
    assertNoError(error);

    const period = mapPeriod(data as Record<string, unknown>);
    const finalSnapshot = {
      ...snapshot,
      period
    };
    await saveMetricsSnapshot(finalSnapshot);
    return finalSnapshot;
  },

  async recordArrival(subsystemId: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc("record_arrival", {
      p_subsystem_id: subsystemId
    });
    assertNoError(error);
  },

  async recordDeparture(subsystemId: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc("record_departure", {
      p_subsystem_id: subsystemId
    });
    assertNoError(error);
  },

  async deleteSubsystemEvents(
    subsystemId: string
  ): Promise<{ deleted: number; subsystemId: string; periodId: string }> {
    const supabase = getSupabaseClient();
    const period = await this.getCurrentPeriod();
    if (!period) {
      throw new Error("No hay periodo activo");
    }

    const { data, error } = await supabase.rpc("clear_subsystem_events", {
      p_subsystem_id: subsystemId
    });
    assertNoError(error);

    return {
      deleted: Number(data ?? 0),
      subsystemId,
      periodId: period.id_periodo
    };
  },

  async getPeriods(): Promise<PeriodSummary[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("periodos_observacion")
      .select(
        "id_periodo,nombre,timestamp_inicio,timestamp_fin,estado,metricas_periodo(id_subsistema,tiempo_observacion_t,total_a,total_c,tasa_llegada_lambda,tasa_servicio_mu)"
      )
      .order("timestamp_inicio", { ascending: false });
    assertNoError(error);

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      ...mapPeriod(row),
      metricas: (((row.metricas_periodo as Record<string, unknown>[] | null) ?? [])).map(mapMetric)
    }));
  },

  async deletePeriod(periodId: string): Promise<{ deleted: boolean; periodId: string }> {
    const active = await this.getCurrentPeriod();
    if (active?.id_periodo === periodId) {
      throw new Error("No se puede borrar el periodo activo. Detenlo primero.");
    }

    const supabase = getSupabaseClient();
    let result = await supabase.from("eventos_operacionales").delete().eq("id_periodo", periodId);
    assertNoError(result.error);
    result = await supabase.from("metricas_periodo").delete().eq("id_periodo", periodId);
    assertNoError(result.error);
    result = await supabase.from("periodos_observacion").delete().eq("id_periodo", periodId);
    assertNoError(result.error);

    return { deleted: true, periodId };
  },

  subscribeLiveChanges(
    onChange: () => void,
    onStatus?: (status: RealtimeStatus) => void
  ): () => void {
    const supabase = getSupabaseClient();
    onStatus?.("CONECTANDO");

    const channel = supabase
      .channel("monitor-operacional-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "periodos_observacion" },
        onChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "eventos_operacionales" },
        onChange
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "metricas_periodo" },
        onChange
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          onStatus?.("CONECTADO");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onStatus?.("ERROR");
        } else {
          onStatus?.("RECONECTANDO");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }
};
