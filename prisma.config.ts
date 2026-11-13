import "dotenv/config";
import { defineConfig } from "prisma/config";

// Supabase:
//   DATABASE_URL → pooler en modo Transaction (puerto 6543) — la usa la app
//   DIRECT_URL   → conexión directa o Session pooler (puerto 5432) — la usa Migrate
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
