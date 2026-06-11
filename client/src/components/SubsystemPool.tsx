import { useCallback, useEffect, useState } from "react";
import type { Subsystem } from "../types/domain";
import { api } from "../lib/api";

interface PoolEntity {
  id: string;
  arrivalTime: number;
  startServiceTime: number | null;
  status: "queue" | "in_service";
}

interface SubsystemPoolProps {
  subsystem: Subsystem;
  disabled: boolean;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SubsystemPool({ subsystem, disabled }: SubsystemPoolProps) {
  const [pool, setPool] = useState<PoolEntity[]>([]);
  const [counter, setCounter] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Tick every second for timers
  useEffect(() => {
    if (disabled) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [disabled]);

  // Auto-clear error after 6 seconds
  useEffect(() => {
    if (!apiError) return;
    const timeout = setTimeout(() => setApiError(null), 6000);
    return () => clearTimeout(timeout);
  }, [apiError]);

  const inService = pool.filter((e) => e.status === "in_service");
  const inQueue = pool.filter((e) => e.status === "queue");
  const maxServers = subsystem.infiniteServers ? Infinity : subsystem.servers;

  const handleArrival = useCallback(async () => {
    const entityId = `${subsystem.id}-${counter}`;
    const timestamp = Date.now();

    setCounter((c) => c + 1);
    setApiError(null);

    const currentInService = pool.filter((e) => e.status === "in_service").length;

    try {
      if (currentInService < maxServers) {
        // Server available → ARRIVAL + START_SERVICE immediately (Wq = 0)
        await api.recordEvent({ subsystemId: subsystem.id, entityId, eventType: "ARRIVAL", timestamp });
        await api.recordEvent({ subsystemId: subsystem.id, entityId, eventType: "START_SERVICE", timestamp });

        setPool((prev) => [
          ...prev,
          { id: entityId, arrivalTime: timestamp, startServiceTime: timestamp, status: "in_service" }
        ]);
      } else {
        // No server available → only ARRIVAL, entity waits in queue
        await api.recordEvent({ subsystemId: subsystem.id, entityId, eventType: "ARRIVAL", timestamp });

        setPool((prev) => [
          ...prev,
          { id: entityId, arrivalTime: timestamp, startServiceTime: null, status: "queue" }
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${subsystem.id}] Error al registrar LLEGADA:`, message);
      setApiError(message);
      // Revert counter since the event failed
      setCounter((c) => c - 1);
    }
  }, [subsystem.id, counter, pool, maxServers]);

  const handleDeparture = useCallback(async () => {
    // FIFO: take entity with earliest startServiceTime
    const inServiceEntities = pool.filter((e) => e.status === "in_service");
    if (inServiceEntities.length === 0) return;

    // Sort by startServiceTime (oldest first)
    const sorted = [...inServiceEntities].sort(
      (a, b) => (a.startServiceTime ?? 0) - (b.startServiceTime ?? 0)
    );
    const entityToRemove = sorted[0];
    const timestamp = Date.now();

    setApiError(null);

    try {
      await api.recordEvent({
        subsystemId: subsystem.id,
        entityId: entityToRemove.id,
        eventType: "DEPARTURE",
        timestamp
      });

      setPool((prev) => {
        const next = prev.filter((e) => e.id !== entityToRemove.id);

        // If there's someone in queue, promote them to in_service
        const queueEntities = next.filter((e) => e.status === "queue");
        if (queueEntities.length > 0) {
          const firstInQueue = queueEntities[0];
          const newStartTime = timestamp;

          // Fire START_SERVICE for the promoted entity (fire-and-forget with error logging)
          api.recordEvent({
            subsystemId: subsystem.id,
            entityId: firstInQueue.id,
            eventType: "START_SERVICE",
            timestamp: newStartTime
          }).catch((promoteErr) => {
            const msg = promoteErr instanceof Error ? promoteErr.message : String(promoteErr);
            console.error(`[${subsystem.id}] Error al promover entidad:`, msg);
            setApiError(msg);
          });

          return next.map((e) =>
            e.id === firstInQueue.id
              ? { ...e, startServiceTime: newStartTime, status: "in_service" as const }
              : e
          );
        }

        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${subsystem.id}] Error al registrar SALIDA:`, message);
      setApiError(message);
    }
  }, [subsystem.id, pool]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setApiError(null);
    try {
      const result = await api.deleteSubsystemEvents(subsystem.id);
      console.log(`[${subsystem.id}] Eliminados ${result.deleted} eventos del periodo ${result.periodId}`);
      setPool([]);
      setCounter(1);
      setConfirmDelete(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${subsystem.id}] Error al borrar datos:`, message);
      setApiError(message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }, [subsystem.id]);

  const occupiedCount = inService.length;
  const maxDisplay = subsystem.infiniteServers ? "∞" : maxServers;
  const hasError = apiError !== null;

  return (
    <div className={`rounded-lg border-2 bg-white p-4 transition-colors ${hasError ? "border-red-400 shadow-red-100 shadow-md" : "border-line"}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">
            {subsystem.id} — {subsystem.name}
          </h2>
          <p className="text-sm text-slate-500">
            {subsystem.queueModel} · {occupiedCount}/{maxDisplay} ocupados
          </p>
        </div>
        {/* Trash button — discrete */}
        {!disabled && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
            title={`Borrar datos de ${subsystem.id}`}
          >
            🗑
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-700 mb-2">
            ¿Borrar todos los eventos de {subsystem.id} en el periodo actual? Esto no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Borrando..." : "Sí, borrar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* API Error indicator */}
      {apiError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          ⚠ {apiError}
        </div>
      )}

      {/* Control buttons */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={handleArrival}
          disabled={disabled}
          className="flex-1 rounded-md bg-action py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          + LLEGADA
        </button>
        <button
          type="button"
          onClick={handleDeparture}
          disabled={disabled || inService.length === 0}
          className="flex-1 rounded-md bg-stop py-3 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          SALIDA
        </button>
      </div>

      {/* In Service Grid */}
      {inService.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 text-xs font-bold uppercase text-slate-500">En servicio</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {inService.map((entity) => {
              const elapsed = now - (entity.startServiceTime ?? entity.arrivalTime);
              return (
                <div
                  key={entity.id}
                  className="flex flex-col items-center rounded-md border-2 border-action bg-blue-50 p-2"
                >
                  <span className="text-sm font-bold text-ink">{entity.id}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-600">
                    <span className="text-lg">⏱</span>
                    {formatElapsed(elapsed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue */}
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

      {/* Empty state */}
      {pool.length === 0 && (
        <div className="py-6 text-center text-sm text-slate-400">
          Sin entidades · presiona + LLEGADA para comenzar
        </div>
      )}
    </div>
  );
}