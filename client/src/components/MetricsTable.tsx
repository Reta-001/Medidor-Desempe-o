import { useEffect, useState } from "react";
import type { Metric } from "../types/domain";
import { api } from "../lib/api";

interface MetricsTableProps {
  metrics: Metric[];
  globalMetric: Metric | null;
  periodStartMs: number | null;
  periodActive: boolean;
}

function formatStopwatch(ms: number): string {
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

export function MetricsTable({ metrics, globalMetric, periodStartMs, periodActive }: MetricsTableProps) {
  const rows = globalMetric ? [...metrics, globalMetric] : metrics;

  // Live stopwatch tick every 50ms for smooth millisecond display
  const [now, setNow] = useState(api.getServerTime());
  useEffect(() => {
    if (!periodActive || periodStartMs === null) return;
    const interval = setInterval(() => setNow(api.getServerTime()), 50);
    return () => clearInterval(interval);
  }, [periodActive, periodStartMs]);

  const elapsed = periodStartMs !== null ? now - periodStartMs : 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-4">
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="metric-table min-w-full border-collapse text-left text-sm">
          <thead className="bg-ink text-white">
            <tr>
              <th className="px-3 py-2">Subsistema</th>
              <th className="px-3 py-2">T</th>
              <th className="px-3 py-2">λ</th>
              <th className="px-3 py-2">μ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((metric) => (
              <tr key={metric.id_subsistema} className="border-t border-line odd:bg-white even:bg-panel">
                <td className="px-3 py-2 font-bold text-ink">
                  {metric.id_subsistema}
                  <span className="ml-2 text-xs font-semibold text-slate-500">
                    {metric.configuracion_queues}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatStopwatch(
                    periodActive && periodStartMs !== null
                      ? now - periodStartMs
                      : metric.tiempo_observacion_t * 1000
                  )}
                </td>
                <td className="px-3 py-2">{formatRate(metric.tasa_llegada_lambda)}</td>
                <td className="px-3 py-2">{formatRate(metric.tasa_servicio_mu)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                  Sin métricas
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
