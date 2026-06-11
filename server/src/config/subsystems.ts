export type SubsystemId =
  | "SC"
  | "BC1"
  | "BC2"
  | "AC1"
  | "AC2"
  | "AC3"
  | "DC"
  | "CC1"
  | "CC2"
  | "CC3";

export interface SubsystemDefinition {
  id: SubsystemId;
  name: string;
  queueModel: string;
  servers: number;
  infiniteServers: boolean;
}

export const SUBSYSTEMS: SubsystemDefinition[] = [
  { id: "SC", name: "Entrada", queueModel: "M/M/2", servers: 2, infiniteServers: false },
  { id: "BC1", name: "Banos 1", queueModel: "M/M/7", servers: 7, infiniteServers: false },
  { id: "BC2", name: "Banos 2", queueModel: "M/M/7", servers: 7, infiniteServers: false },
  { id: "AC1", name: "Guardarropa 1", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "AC2", name: "Guardarropa 2", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "AC3", name: "Guardarropa 3", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "DC", name: "Pista de baile", queueModel: "M/M/inf", servers: 0, infiniteServers: true },
  { id: "CC1", name: "Barra 1", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "CC2", name: "Barra 2", queueModel: "M/M/1", servers: 1, infiniteServers: false },
  { id: "CC3", name: "Barra 3", queueModel: "M/M/1", servers: 1, infiniteServers: false }
];

export const GLOBAL_SUBSYSTEM = {
  id: "GLOBAL",
  name: "Resumen operacional",
  queueModel: "Agregado local",
  servers: 0,
  infiniteServers: true
} as const;

export function findSubsystem(id: string): SubsystemDefinition | undefined {
  return SUBSYSTEMS.find((subsystem) => subsystem.id === id);
}
