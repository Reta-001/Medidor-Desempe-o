export type OperationalEventType = "ARRIVAL" | "START_SERVICE" | "DEPARTURE";

export interface OperationalEventInput {
  subsystemId: string;
  entityId: string;
  eventType: OperationalEventType;
  timestamp?: number;
}

export interface QueuedOperationalEvent extends Required<Omit<OperationalEventInput, "timestamp">> {
  timestamp: number;
  acceptedAt: number;
}