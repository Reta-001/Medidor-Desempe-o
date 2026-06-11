import { CircleStop, Play, RefreshCw } from "lucide-react";
import type { Period } from "../types/domain";

interface ControlBarProps {
  period: Period | null;
  onStart: () => void;
  onStop: () => void;
  busy: boolean;
}

export function ControlBar({ period, onStart, onStop, busy }: ControlBarProps) {
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onStart}
          disabled={busy || period?.estado === "ACTIVO"}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
          title="Iniciar periodo"
        >
          <Play size={18} />
          Iniciar T
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={busy || period?.estado !== "ACTIVO"}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-stop px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
          title="Detener y exportar"
        >
          <CircleStop size={18} />
          Detener y Exportar
        </button>
        <div className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm text-slate-700">
          <RefreshCw size={16} />
          {period?.estado === "ACTIVO" ? "Periodo activo" : "Sin periodo activo"}
        </div>
      </div>
    </section>
  );
}