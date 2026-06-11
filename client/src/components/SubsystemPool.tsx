import { useCallback, useEffect, useState } from "react";
import { Clock3, Trash2 } from "lucide-react";
import type { PoolEntity, Subsystem } from "../types/domain";
import { api } from "../lib/api";

interface SubsystemPoolProps {
  subsystem: Subsystem;
  pool: PoolEntity[];
  disabled: boolean;
  onArrival: (subsystemId: string) => Promise<void>;
  onDeparture: (subsystemId: string) => Promise<void>;
  onDelete: (subsystemId: string) => Promise<void>;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SubsystemPool({
  subsystem,
  pool,
  disabled,
  onArrival,
  onDeparture,
  onDelete
}: SubsystemPoolProps) {
  const [now, setNow] = useState(api.getServerTime());
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState<"arrival" | "departure" | "delete" | null>(null);

  useEffect(() => {
    if (disabled || pool.length === 0) return;
    const interval = setInterval(() => setNow(api.getServerTime()), 1000);
    return () => clearInterval(interval);
  }, [disabled, pool.length]);

  useEffect(() => {
    if (!apiError) return;
    const timeout = setTimeout(() => setApiError(null), 6000);
    return () => clearTimeout(timeout);
  }, [apiError]);

  const runAction = useCallback(
    async (action: "arrival" | "departure" | "delete", callback: () => Promise<void>) => {
      setWorking(action);
      setApiError(null);
      try {
        await callback();
        if (action === "delete") {
          setConfirmDelete(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${subsystem.id}]`, message);
        setApiError(message);
      } finally {
        setWorking(null);
      }
    },
    [subsystem.id]
  );

  const handleArrival = useCallback(() => {
    void runAction("arrival", () => onArrival(subsystem.id));
  }, [onArrival, runAction, subsystem.id]);

  const handleDeparture = useCallback(() => {
    void runAction("departure", () => onDeparture(subsystem.id));
  }, [onDeparture, runAction, subsystem.id]);

  const handleDelete = useCallback(() => {
    void runAction("delete", () => onDelete(subsystem.id));
  }, [onDelete, runAction, subsystem.id]);

  const inService = pool.filter((entity) => entity.status === "in_service");
  const inQueue = pool.filter((entity) => entity.status === "queue");
  const maxServers = subsystem.infiniteServers ? Infinity : subsystem.servers;
  const occupiedCount = inService.length;
  const maxDisplay = subsystem.infiniteServers ? "∞" : maxServers;
  const hasError = apiError !== null;
  const controlsDisabled = disabled || working !== null;

  return (
    <div className={`rounded-lg border-2 bg-white p-4 transition-colors ${hasError ? "border-red-400 shadow-red-100 shadow-md" : "border-line"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">
            {subsystem.id} - {subsystem.name}
          </h2>
          <p className="text-sm text-slate-500">
            {subsystem.queueModel} · {occupiedCount}/{maxDisplay} ocupados
          </p>
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={working !== null}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
            title={`Borrar datos de ${subsystem.id}`}
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="mb-2 text-sm font-semibold text-red-700">
            ¿Borrar todos los eventos de {subsystem.id} en el periodo actual? Esto no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={working !== null}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {working === "delete" ? "Borrando..." : "Sí, borrar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={working !== null}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {apiError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {apiError}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={handleArrival}
          disabled={controlsDisabled}
          className="flex-1 rounded-md bg-action py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {working === "arrival" ? "REGISTRANDO..." : "+ LLEGADA"}
        </button>
        <button
          type="button"
          onClick={handleDeparture}
          disabled={controlsDisabled || inService.length === 0}
          className="flex-1 rounded-md bg-stop py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {working === "departure" ? "REGISTRANDO..." : "SALIDA"}
        </button>
      </div>

      {inService.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-xs font-bold uppercase text-slate-500">En servicio</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
            {inService.map((entity) => {
              const elapsed = now - (entity.startServiceTime ?? entity.arrivalTime);
              return (
                <div
                  key={entity.id}
                  className="flex min-h-16 flex-col items-center justify-center rounded-md border-2 border-action bg-blue-50 p-2"
                >
                  <span className="max-w-full truncate text-sm font-bold text-ink">{entity.id}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-600">
                    <Clock3 size={14} />
                    {formatElapsed(elapsed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {inQueue.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold uppercase text-slate-500">En cola</div>
          <div className="flex flex-wrap gap-2">
            {inQueue.map((entity) => (
              <span
                key={entity.id}
                className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700"
              >
                {entity.id}
              </span>
            ))}
          </div>
        </div>
      )}

      {pool.length === 0 && (
        <div className="py-6 text-center text-sm text-slate-400">
          Sin entidades · presiona + LLEGADA para comenzar
        </div>
      )}
    </div>
  );
}
