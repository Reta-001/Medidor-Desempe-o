import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Activity } from "lucide-react";
import { ControlBar } from "./components/ControlBar";
import { MetricsTable } from "./components/MetricsTable";
import { SubsystemPool } from "./components/SubsystemPool";
import { PeriodHistory } from "./components/PeriodHistory";
import { api } from "./lib/api";
import { buildPoolsBySubsystem } from "./lib/poolState";
import { computeMetricsSnapshot, emptyMetricsSnapshot } from "./lib/operationalMath";
import type {
  MetricsSnapshot,
  OperationalEventRow,
  Period,
  PeriodSummary,
  Subsystem
} from "./types/domain";

export default function App() {
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [events, setEvents] = useState<OperationalEventRow[]>([]);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot>(emptyMetricsSnapshot());
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [stoppedSnapshot, setStoppedSnapshot] = useState<MetricsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState(api.isConfigured ? "CONECTANDO" : "SIN CONFIG");

  const pools = useMemo(
    () => buildPoolsBySubsystem(subsystems, events),
    [subsystems, events]
  );

  const loadHistory = useCallback(async () => {
    if (!api.isConfigured) {
      return;
    }

    try {
      setPeriods(await api.getPeriods());
    } catch (err) {
      console.error("Error al cargar el historial:", err);
    }
  }, []);

  const refreshLiveState = useCallback(async () => {
    if (!api.isConfigured) {
      return;
    }

    try {
      const live = await api.getLiveState();
      setPeriod(live.period);
      setEvents(live.events);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    api.getSubsystems()
      .then((loadedSubsystems) => {
        if (!mounted) return;
        setSubsystems(loadedSubsystems);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });

    if (!api.isConfigured) {
      setError(
        "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Configuralas en Vercel o en client/.env."
      );
      return () => {
        mounted = false;
      };
    }

    api.syncServerTime()
      .then(() => {
        if (!mounted) return;
        return Promise.all([api.getLiveState(), api.getPeriods()]);
      })
      .then((results) => {
        if (!mounted || !results) return;
        const [live, history] = results;
        setPeriod(live.period);
        setEvents(live.events);
        setPeriods(history);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!api.isConfigured) {
      return;
    }

    let refreshTimeout: number | null = null;
    const refreshEverything = () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      refreshTimeout = window.setTimeout(() => {
        void refreshLiveState();
        void loadHistory();
      }, 120);
    };

    const unsubscribe = api.subscribeLiveChanges(refreshEverything, setRealtimeStatus);
    return () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      unsubscribe();
    };
  }, [loadHistory, refreshLiveState]);

  useEffect(() => {
    if (!period || subsystems.length === 0) {
      setSnapshot(emptyMetricsSnapshot());
      return;
    }

    const compute = () => {
      setSnapshot(computeMetricsSnapshot(period, subsystems, events, api.getServerTime()));
    };

    compute();
    if (period.estado !== "ACTIVO") {
      return;
    }

    const interval = window.setInterval(compute, 1000);
    return () => window.clearInterval(interval);
  }, [events, period, subsystems]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStoppedSnapshot(null);
    try {
      const next = await api.startPeriod();
      setPeriod(next);
      setEvents([]);
      await refreshLiveState();
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadHistory, refreshLiveState]);

  const stop = useCallback(async () => {
    if (!period || period.estado !== "ACTIVO") {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const stoppedAt = api.getServerTime();
      const finalSnapshot = computeMetricsSnapshot(
        { ...period, estado: "CERRADO", timestamp_fin: stoppedAt },
        subsystems,
        events,
        stoppedAt
      );
      const stopped = await api.stopPeriod(finalSnapshot, stoppedAt);
      setStoppedSnapshot(stopped);
      setPeriod(null);
      setEvents([]);
      await refreshLiveState();
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [events, loadHistory, period, refreshLiveState, subsystems]);

  const recordArrival = useCallback(
    async (subsystemId: string) => {
      await api.recordArrival(subsystemId);
      await refreshLiveState();
    },
    [refreshLiveState]
  );

  const recordDeparture = useCallback(
    async (subsystemId: string) => {
      await api.recordDeparture(subsystemId);
      await refreshLiveState();
    },
    [refreshLiveState]
  );

  const deleteSubsystemEvents = useCallback(
    async (subsystemId: string) => {
      await api.deleteSubsystemEvents(subsystemId);
      await refreshLiveState();
    },
    [refreshLiveState]
  );

  const deletePeriod = useCallback(
    async (periodId: string) => {
      setError(null);
      try {
        await api.deletePeriod(periodId);
        void loadHistory();
        if (stoppedSnapshot?.period?.id_periodo === periodId) {
          setStoppedSnapshot(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadHistory, stoppedSnapshot]
  );

  const disabled = period?.estado !== "ACTIVO" || busy || !api.isConfigured;

  return (
    <main className="min-h-screen bg-[#eef2f6] pb-12 text-ink">
      <header className="border-b border-line bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Activity size={26} />
            <div>
              <h1 className="text-xl font-bold">Monitor Operacional</h1>
              <p className="text-sm font-medium text-slate-300">Eventos discretos / PROMODEL</p>
            </div>
          </div>
          <div className="text-right text-sm font-semibold text-slate-300">
            {period?.estado === "ACTIVO"
              ? `Periodo activo · ${subsystems.length} subsistemas`
              : "Sin periodo activo"}
          </div>
        </div>
      </header>

      <ControlBar
        period={period}
        onStart={start}
        onStop={stop}
        busy={busy}
        realtimeStatus={realtimeStatus}
        ready={api.isConfigured}
      />

      {error ? (
        <div className="mx-auto mt-4 flex max-w-7xl items-center gap-2 rounded-md border border-stop bg-white px-4 py-3 text-sm font-semibold text-stop">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subsystems.map((subsystem) => (
            <SubsystemPool
              key={subsystem.id}
              subsystem={subsystem}
              pool={pools[subsystem.id] ?? []}
              disabled={disabled}
              onArrival={recordArrival}
              onDeparture={recordDeparture}
              onDelete={deleteSubsystemEvents}
            />
          ))}
        </div>
      </section>

      {period?.estado === "ACTIVO" && (
        <MetricsTable
          metrics={snapshot.subsystemMetrics}
          globalMetric={snapshot.globalMetric}
          periodStartMs={period.timestamp_inicio}
          periodActive={true}
        />
      )}

      {stoppedSnapshot && (
        <section className="mx-auto max-w-7xl px-4 py-4">
          <div className="relative overflow-hidden rounded-lg border border-emerald-300 bg-emerald-50/40 p-6 shadow-sm">
            <div className="absolute left-0 right-0 top-0 h-1 bg-emerald-500" />
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Resumen de la Medición Guardada
                </span>
                <h2 className="mt-2 text-xl font-bold text-ink">
                  {stoppedSnapshot.period?.nombre || "Medición Finalizada con Éxito"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setStoppedSnapshot(null)}
                className="rounded border border-line bg-white px-3 py-1.5 text-sm font-bold text-slate-500 shadow-sm transition-colors hover:text-slate-700"
              >
                Cerrar Resumen
              </button>
            </div>

            <p className="mb-4 text-sm font-medium text-slate-600">
              Se han registrado y persistido todas las métricas de rendimiento en Supabase/PostgreSQL.
            </p>

            <MetricsTable
              metrics={stoppedSnapshot.subsystemMetrics}
              globalMetric={stoppedSnapshot.globalMetric}
              periodStartMs={stoppedSnapshot.period?.timestamp_inicio ?? null}
              periodActive={false}
            />
          </div>
        </section>
      )}

      <PeriodHistory periods={periods} onDelete={deletePeriod} />
    </main>
  );
}
