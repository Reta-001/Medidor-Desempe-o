import { describe, expect, it } from "vitest";
import { SUBSYSTEMS } from "../src/config/subsystems.js";
import { computeSubsystemMetric } from "../src/analysis/operationalMath.js";

describe("computeSubsystemMetric", () => {
  it("calcula A, C, B, Wq, W y utilizacion para un M/M/1 simple", () => {
    const sc = SUBSYSTEMS.find((subsystem) => subsystem.id === "SC");
    if (!sc) {
      throw new Error("SC no encontrado");
    }

    const metric = computeSubsystemMetric(
      sc,
      [
        {
          id_subsistema: "SC",
          id_entidad: "E1",
          tipo_evento: "ARRIVAL",
          id_servidor_asignado: null,
          timestamp_milisegundos: 0
        },
        {
          id_subsistema: "SC",
          id_entidad: "E1",
          tipo_evento: "START_SERVICE",
          id_servidor_asignado: 1,
          timestamp_milisegundos: 1000
        },
        {
          id_subsistema: "SC",
          id_entidad: "E1",
          tipo_evento: "DEPARTURE",
          id_servidor_asignado: 1,
          timestamp_milisegundos: 4000
        }
      ],
      0,
      10_000
    );

    expect(metric.total_A).toBe(1);
    expect(metric.total_C).toBe(1);
    expect(metric.tiempo_ocupado_B).toBe(3);
    expect(metric.Wq_tiempo_espera_cola).toBe(1);
    expect(metric.W_tiempo_sistema).toBe(4);
    expect(metric.utilizacion_U).toBe(0.3);
  });
});
