// Herramienta interna: genera/aplica migraciones con el motor de esquema de Prisma en WebAssembly.
// Úsala solo si `prisma migrate` no puede descargar sus binarios (entornos sin acceso a binaries.prisma.sh).
// Uso: node prisma/wasm-migrate.mjs diff   -> imprime SQL desde vacío al schema
//      node prisma/wasm-migrate.mjs apply  -> aplica prisma/migrations pendientes
import fs from "node:fs";
import path from "node:path";
import { SchemaEngine } from "@prisma/schema-engine-wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg({ connectionString: process.env.DATABASE_URL }));
const logs = [];
const engine = await SchemaEngine.new({ datamodels: [["schema.prisma", schema]] }, (m) => logs.push(m), adapter);
const filters = { externalTables: [], externalEnums: [] };
const cmd = process.argv[2];
if (cmd === "diff") {
  const r = await engine.diff({ from: { tag: "empty" }, to: { tag: "schemaDatamodel", files: [{ path: "schema.prisma", content: schema }] }, script: true, exitCode: null, filters });
  process.stdout.write(r.stdout ?? "");
} else if (cmd === "apply") {
  const dir = "prisma/migrations";
  const migrationDirectories = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort().map((d) => ({ path: d, migrationFile: { path: "migration.sql", content: { tag: "ok", value: fs.readFileSync(path.join(dir, d, "migration.sql"), "utf8") } } }));
  const lockPath = path.join(dir, "migration_lock.toml");
  const r = await engine.applyMigrations({ migrationsList: { baseDir: dir, lockfile: { path: "migration_lock.toml", content: fs.existsSync(lockPath) ? fs.readFileSync(lockPath, "utf8") : null }, migrationDirectories, shadowDbInitScript: "" }, filters });
  console.log("Aplicadas:", r.appliedMigrationNames);
}
