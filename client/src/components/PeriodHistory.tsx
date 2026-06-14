import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Calendar, Clock, BarChart2 } from "lucide-react";
import type { PeriodSummary } from "../types/domain";

interface PeriodHistoryProps {
  periods: PeriodSummary[];
  onDelete: (periodId: string) => void;
}

function formatDuration(secondsVal: number): string {
  const ms = secondsVal * 1000;
  const clamped = Math.max(ms, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  const millis = Math.floor(clamped % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const ms3 = millis.toString().padStart(3, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${ms3}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${ms3}`;
}

function formatRate(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return value.toLocaleString("es-CL", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value > 0 && value < 1 ? digits : 0
  });
}

export function PeriodHistory({ periods, onDelete }: PeriodHistoryProps) {
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedPeriodId((prev) => (prev === id ? null : id));
  };

  // Only show closed periods in history
  const closedPeriods = periods.filter((p) => p.estado === "CERRADO");

  if (closedPeriods.length === 0) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="rounded-lg border border-line bg-white p-8 text-center text-slate-500 shadow-sm">
          <BarChart2 className="mx-auto mb-3 text-slate-400" size={36} />
          <h3 className="text-lg font-bold text-ink mb-1">Sin mediciones guardadas</h3>
          <p className="text-sm">Inicia un periodo de observación y detenlo para ver el historial aquí.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-ink">Historial de Mediciones</h2>
        <p className="text-sm text-slate-500">Resultados acumulados de sesiones de monitoreo completadas</p>
      </div>

      <div className="space-y-4">
        {closedPeriods.map((period, index) => {
          const isExpanded = expandedPeriodId === period.id_periodo;
          const isConfirmingDelete = confirmDeleteId === period.id_periodo;
          const dateStr = new Date(period.timestamp_inicio).toLocaleString("es-CL", {
            dateStyle: "medium",
            timeStyle: "short"
          });

          // Calculate total duration from the global metric if present, or from timestamps
          const globalMetric = period.metricas.find((m) => m.id_subsistema === "GLOBAL");
          const durationSeconds = globalMetric
            ? globalMetric.tiempo_observacion_t
            : period.timestamp_fin && period.timestamp_inicio
            ? (period.timestamp_fin - period.timestamp_inicio) / 1000
            : 0;

          // Number of events (sum of A across all subsystems except global)
          const totalEvents = period.metricas
            .filter((m) => m.id_subsistema !== "GLOBAL")
            .reduce((sum, m) => sum + m.total_a, 0);

          return (
            <div
              key={period.id_periodo}
              className="overflow-hidden rounded-lg border border-line bg-white shadow-sm transition-all duration-200"
            >
              {/* Header card info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 bg-white hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-panel text-action font-bold">
                    #{closedPeriods.length - index}
                  </div>
                  <div>
                    <h3 className="font-bold text-ink text-base">
                      {period.nombre || `Medición #${closedPeriods.length - index}`}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        Duración: {formatDuration(durationSeconds)}
                      </span>
                      <span className="font-medium text-slate-600">
                        {totalEvents} eventos registrados
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => toggleExpand(period.id_periodo)}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-panel transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        Ocultar datos <ChevronUp size={16} />
                      </>
                    ) : (
                      <>
                        Ver datos <ChevronDown size={16} />
                      </>
                    )}
                  </button>

                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(period.id_periodo);
                          setConfirmDeleteId(null);
                        }}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 transition-colors"
                      >
                        Sí, borrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-panel transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(period.id_periodo)}
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Eliminar esta medición"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible details table */}
              {isExpanded && (
                <div className="border-t border-line bg-panel p-4">
                  <div className="overflow-x-auto rounded-lg border border-line bg-white">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-ink text-white">
                        <tr>
                          <th className="px-4 py-2.5">Subsistema</th>
                          <th
                            className="px-4 py-2.5 cursor-help"
                            title="Tiempo de observación acumulado en segundos (T)"
                          >
                            T
                          </th>
                          <th
                            className="px-4 py-2.5 cursor-help"
                            title={`Tasa de llegada (λ = A / T) donde:\n• A: Total de arribos registrados en el subsistema\n• T: Tiempo de observación en segundos (T)`}
                          >
                            λ (Tasa de llegada: A / T)
                          </th>
                          <th
                            className="px-4 py-2.5 cursor-help"
                            title={`Tasa de servicio (μ = 1 / S) donde:\n• S: Tiempo promedio de servicio (tiempo neto de atención por cliente, sin fila)\n• μ: Clientes que cada servidor puede atender por segundo`}
                          >
                            μ (Tasa de servicio: 1 / S)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {period.metricas.map((metric) => (
                          <tr
                            key={metric.id_subsistema}
                            className="border-t border-line odd:bg-white even:bg-panel"
                          >
                            <td className="px-4 py-2.5 font-bold text-ink">
                              {metric.id_subsistema === "GLOBAL" ? "GLOBAL" : metric.id_subsistema}
                            </td>
                            <td className="px-4 py-2.5 font-mono">
                              {formatDuration(metric.tiempo_observacion_t)}
                            </td>
                            <td
                              className="px-4 py-2.5 cursor-help"
                              title={`Arribos totales (A): ${metric.total_a} personas`}
                            >
                              {formatRate(metric.tasa_llegada_lambda)}
                            </td>
                            <td
                              className="px-4 py-2.5 cursor-help"
                              title={`Salidas totales (C): ${metric.total_c} personas`}
                            >
                              {formatRate(metric.tasa_servicio_mu)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
