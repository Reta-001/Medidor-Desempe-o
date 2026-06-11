import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Activity } from "lucide-react";
import { ControlBar } from "./components/ControlBar";
import { MetricsTable } from "./components/MetricsTable";
import { SubsystemPool } from "./components/SubsystemPool";
import { PeriodHistory } from "./components/PeriodHistory";
import { api } from "./lib/api";
import type { MetricsSnapshot, Period, Subsystem, PeriodSummary } from "./types/domain";

export default function App() {
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot>({
    period: null,
    subsystemMetrics: [],
    globalMetric: null
  });
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [stoppedSnapshot, setStoppedSnapshot] = useState<MetricsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const history = await api.getPeriods();
      setPeriods(history);
    } catch (err) {
      console.error("Error al cargar el historial:", err);
    }
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const metrics = await api.getCurrentMetrics();
      setSnapshot(metrics);
      if (metrics.period) {
        setPeriod(metrics.period);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }, []);

  // Initial load
  useEffect(() => {
    let mounted = true;
    Promise.all([api.getSubsystems(), api.getCurrentPeriod(), api.getCurrentMetrics(), api.getPeriods()])
      .then(([loadedSubsystems, currentPeriod, metrics, history]) => {
        if (!mounted) return;
        setSubsystems(loadedSubsystems);
        setPeriod(currentPeriod);
        setSnapshot(metrics);
        setPeriods(history);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-refresh every 1s when period is active
  useEffect(() => {
    const interval = setInterval(() => {
      if (period?.estado === "ACTIVO") {
        void refreshMetrics();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [period, refreshMetrics]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStoppedSnapshot(null); // Clear previous summary when starting new period
    try {
      const next = await api.startPeriod();
      setPeriod(next);
      await refreshMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshMetrics]);

  const stop = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const stopped = await api.stopPeriod();
      setPeriod(stopped.period);
      setSnapshot(stopped);
      setStoppedSnapshot(stopped); // Show summary
      void loadHistory(); // Refresh history list
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadHistory]);

  const deletePeriod = useCallback(async (periodId: string) => {
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
  }, [loadHistory, stoppedSnapshot]);

  const disabled = period?.estado !== "ACTIVO" || busy;

  return (
    <main className="min-h-screen bg-[#eef2f6] text-ink pb-12">
      <header className="border-b border-line bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Activity size={26} />
            <div>
              <h1 className="text-xl font-bold">Monitor Operacional</h1>
              <p className="text-sm font-medium text-slate-300">Eventos discretos / PROMODEL</p>
            </div>
          </div>
          <div className="text-sm font-semibold text-slate-300">
            {period?.estado === "ACTIVO" ? `Periodo activo · ${subsystems.length} subsistemas` : "Sin periodo activo"}
          </div>
        </div>
      </header>

      <ControlBar
        period={period}
        onStart={start}
        onStop={stop}
        busy={busy}
      />

      {error ? (
        <div className="mx-auto mt-4 flex max-w-7xl items-center gap-2 rounded-md border border-stop bg-white px-4 py-3 text-sm font-semibold text-stop">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {/* All subsystem pools */}
      <section className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subsystems.map((subsystem) => (
            <SubsystemPool
              key={subsystem.id}
              subsystem={subsystem}
              disabled={disabled}
            />
          ))}
        </div>
      </section>

      {/* Live metrics shown only when period is active */}
      {period?.estado === "ACTIVO" && (
        <MetricsTable
          metrics={snapshot.subsystemMetrics}
          globalMetric={snapshot.globalMetric}
          periodStartMs={period?.timestamp_inicio ?? null}
          periodActive={true}
        />
      )}

      {/* Stopped metrics summary display */}
      {stoppedSnapshot && (
        <section className="mx-auto max-w-7xl px-4 py-4">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-emerald-500"></div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Resumen de la Medición Guardada
                </span>
                <h2 className="text-xl font-bold text-ink mt-2">
                  {stoppedSnapshot.period?.nombre || "Medición Finalizada con Éxito"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setStoppedSnapshot(null)}
                className="text-slate-500 hover:text-slate-700 font-bold text-sm bg-white border border-line rounded px-3 py-1.5 shadow-xs transition-colors"
              >
                ✕ Cerrar Resumen
              </button>
            </div>
            
            <p className="mb-4 text-sm text-slate-600 font-medium">
              Se han registrado y persistido todas las métricas de rendimiento en la base de datos PostgreSQL.
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

      {/* Measurement History Section */}
      <PeriodHistory
        periods={periods}
        onDelete={deletePeriod}
      />
    </main>
  );
}