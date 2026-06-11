import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { computeMetricsSnapshot, getActivePeriod } from "../analysis/metrics.js";
import { SUBSYSTEMS } from "../config/subsystems.js";
import { runMigrations } from "../db/migrate.js";
import { pool } from "../db/pool.js";
import { EventWriteQueue } from "../events/eventQueue.js";
import { exportInterarrivalsCsv, exportServiceTimesCsv } from "../exports/promodel.js";
import { startObservationPeriod, stopObservationPeriod } from "../periods/service.js";

const eventQueue = new EventWriteQueue(pool);

function text(content: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof content === "string" ? content : JSON.stringify(content, null, 2)
      }
    ]
  };
}

function assertReadOnlySql(query: string): void {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!/^(select|with|explain)\b/.test(normalized)) {
    throw new Error("sql_select solo permite SELECT, WITH o EXPLAIN");
  }
  if (normalized.includes(";")) {
    throw new Error("sql_select acepta una sola sentencia sin punto y coma");
  }
}

async function main() {
  await runMigrations();

  const server = new McpServer({
    name: "monitor-operacional-postgres",
    version: "1.0.0"
  });

  server.resource("schema_sql", "schema://monitor-operacional/postgresql", async (uri) => {
    const currentFile = fileURLToPath(import.meta.url);
    const schemaPath = path.resolve(path.dirname(currentFile), "../../../database/001_init.sql");
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/sql",
          text: await readFile(schemaPath, "utf8")
        }
      ]
    };
  });

  server.resource("subsistemas", "monitor://subsistemas", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(SUBSYSTEMS, null, 2)
      }
    ]
  }));

  server.tool(
    "iniciar_periodo_observacion",
    {
      name: z.string().optional()
    },
    async ({ name }) => text(await startObservationPeriod(pool, name))
  );

  server.tool("detener_periodo_observacion", {}, async () => {
    const snapshot = await stopObservationPeriod(pool, eventQueue);
    return text(snapshot);
  });

  server.tool(
    "registrar_evento_operacional",
    {
      subsystemId: z.string(),
      entityId: z.string(),
      eventType: z.enum(["ARRIVAL", "START_SERVICE", "DEPARTURE"]),
      timestamp: z.number().int().positive().optional()
    },
    async (input) => {
      const accepted = eventQueue.enqueue(input);
      await eventQueue.flush();
      return text({ accepted, queue: eventQueue.getStatus() });
    }
  );

  server.tool("metricas_periodo_activo", {}, async () => {
    await eventQueue.flush();
    const active = await getActivePeriod(pool);
    if (!active) {
      return text({ period: null, subsystemMetrics: [], globalMetric: null });
    }
    return text(await computeMetricsSnapshot(pool, active.id_periodo));
  });

  server.tool(
    "exportar_promodel_csv",
    {
      periodId: z.string(),
      dataset: z.enum(["interarrivals", "services"])
    },
    async ({ periodId, dataset }) => {
      await eventQueue.flush();
      const csv =
        dataset === "interarrivals"
          ? await exportInterarrivalsCsv(pool, periodId)
          : await exportServiceTimesCsv(pool, periodId);
      return {
        content: [
          {
            type: "text",
            mimeType: "text/csv",
            text: csv
          }
        ]
      };
    }
  );

  server.tool(
    "sql_select",
    {
      query: z.string().min(1),
      limit: z.number().int().positive().max(500).default(100)
    },
    async ({ query, limit }) => {
      assertReadOnlySql(query);
      const result = await pool.query(`SELECT * FROM (${query}) AS monitor_sql_select LIMIT $1`, [
        limit
      ]);
      return text({ rows: result.rows, rowCount: result.rowCount });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(async (error) => {
  console.error("[mcp] error fatal", error);
  await pool.end();
  process.exit(1);
});