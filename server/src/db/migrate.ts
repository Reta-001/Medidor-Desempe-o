import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pool } from "./pool.js";

export async function runMigrations(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const schemaPath = path.resolve(path.dirname(currentFile), "../../../database/001_init.sql");
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  runMigrations()
    .then(async () => {
      console.log("Migracion PostgreSQL aplicada correctamente.");
      await pool.end();
    })
    .catch(async (error) => {
      console.error("Error aplicando migracion PostgreSQL:", error);
      await pool.end();
      process.exitCode = 1;
    });
}
