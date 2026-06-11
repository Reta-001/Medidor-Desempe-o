import type { OperationalEventRow, PoolEntity, Subsystem } from "../types/domain";

interface MutableEntityState {
  id: string;
  arrivalTime: number;
  startServiceTime: number | null;
  departed: boolean;
}

function sortByTimeline(left: PoolEntity, right: PoolEntity): number {
  return (
    (left.startServiceTime ?? left.arrivalTime) -
      (right.startServiceTime ?? right.arrivalTime) ||
    left.arrivalTime - right.arrivalTime ||
    left.id.localeCompare(right.id)
  );
}

export function buildPoolsBySubsystem(
  subsystems: Subsystem[],
  events: OperationalEventRow[]
): Record<string, PoolEntity[]> {
  const pools: Record<string, PoolEntity[]> = Object.fromEntries(
    subsystems.map((subsystem) => [subsystem.id, []])
  );
  const state = new Map<string, MutableEntityState>();

  const ordered = [...events].sort(
    (left, right) =>
      left.timestamp_milisegundos - right.timestamp_milisegundos || left.id - right.id
  );

  for (const event of ordered) {
    const key = `${event.id_subsistema}:${event.id_entidad}`;
    const current =
      state.get(key) ??
      ({
        id: event.id_entidad,
        arrivalTime: event.timestamp_milisegundos,
        startServiceTime: null,
        departed: false
      } satisfies MutableEntityState);

    if (event.tipo_evento === "ARRIVAL") {
      current.arrivalTime = event.timestamp_milisegundos;
      current.departed = false;
    } else if (event.tipo_evento === "START_SERVICE") {
      current.startServiceTime = event.timestamp_milisegundos;
    } else if (event.tipo_evento === "DEPARTURE") {
      current.departed = true;
    }

    state.set(key, current);
  }

  for (const [key, entity] of state) {
    if (entity.departed) {
      continue;
    }

    const subsystemId = key.split(":")[0];
    const pool = pools[subsystemId];
    if (!pool) {
      continue;
    }

    pool.push({
      id: entity.id,
      arrivalTime: entity.arrivalTime,
      startServiceTime: entity.startServiceTime,
      status: entity.startServiceTime === null ? "queue" : "in_service"
    });
  }

  for (const pool of Object.values(pools)) {
    pool.sort(sortByTimeline);
  }

  return pools;
}
