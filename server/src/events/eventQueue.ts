import type { Pool, PoolClient } from "pg";
import { findSubsystem } from "../config/subsystems.js";
import type { OperationalEventInput, QueuedOperationalEvent } from "./types.js";

interface QueueStatus {
  queued: number;
  draining: boolean;
  accepted: number;
  persisted: number;
  failed: number;
  lastError: string | null;
}

export class EventWriteQueue {
  private queue: QueuedOperationalEvent[] = [];
  private drainPromise: Promise<void> | null = null;
  private accepted = 0;
  private persisted = 0;
  private failed = 0;
  private lastError: string | null = null;

  constructor(private readonly pool: Pool) {}

  enqueue(input: OperationalEventInput): QueuedOperationalEvent {
    const event = this.normalize(input);
    this.queue.push(event);
    this.accepted += 1;
    this.scheduleDrain();
    return event;
  }

  getStatus(): QueueStatus {
    return {
      queued: this.queue.length,
      draining: this.drainPromise !== null,
      accepted: this.accepted,
      persisted: this.persisted,
      failed: this.failed,
      lastError: this.lastError
    };
  }

  async flush(): Promise<void> {
    while (this.queue.length > 0 || this.drainPromise) {
      if (this.drainPromise) {
        await this.drainPromise;
      } else {
        this.scheduleDrain();
      }
    }
  }

  private normalize(input: OperationalEventInput): QueuedOperationalEvent {
    const subsystem = findSubsystem(input.subsystemId);
    if (!subsystem) {
      throw new Error(`Subsistema desconocido: ${input.subsystemId}`);
    }

    const timestamp = Number.isFinite(input.timestamp)
      ? Number(input.timestamp)
      : Date.now();
    const entityId = input.entityId?.trim();
    if (!entityId) {
      throw new Error("id_entidad es obligatorio");
    }

    return {
      subsystemId: subsystem.id,
      entityId,
      eventType: input.eventType,
      timestamp,
      acceptedAt: Date.now()
    };
  }

  private scheduleDrain(): void {
    if (this.drainPromise) {
      return;
    }

    this.drainPromise = this.drain()
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        this.drainPromise = null;
        if (this.queue.length > 0) {
          this.scheduleDrain();
        }
      });
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (!event) {
        continue;
      }

      const client = await this.pool.connect();
      try {
        await this.persistEvent(client, event);
        this.persisted += 1;
      } catch (error) {
        this.failed += 1;
        this.lastError = error instanceof Error ? error.message : String(error);
        console.error("[event-queue] error persistiendo evento", this.lastError);
      } finally {
        client.release();
      }
    }
  }

  private async persistEvent(client: PoolClient, event: QueuedOperationalEvent): Promise<void> {
    await client.query("BEGIN");
    try {
      const activePeriod = await client.query<{ id_periodo: string }>(
        "SELECT id_periodo FROM periodos_observacion WHERE estado = 'ACTIVO' ORDER BY timestamp_inicio DESC LIMIT 1"
      );
      const periodId = activePeriod.rows[0]?.id_periodo ?? null;

      await client.query(
        `INSERT INTO eventos_operacionales (
            id_subsistema,
            id_entidad,
            tipo_evento,
            timestamp_milisegundos,
            id_periodo
          )
          VALUES ($1, $2, $3, $4, $5)`,
        [
          event.subsystemId,
          event.entityId,
          event.eventType,
          event.timestamp,
          periodId
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}
