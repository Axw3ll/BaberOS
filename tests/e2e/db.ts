import "dotenv/config";
import { Pool } from "pg";

// Consultas directas a la base para preparar y revisar las pruebas (tokens, totales, limpieza).
let pool: Pool | null = null;
const get = () => (pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 }));

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await get().query(text, params);
  return r.rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql<T>(text, params);
  if (!rows.length) throw new Error(`Sin resultados: ${text}`);
  return rows[0];
}

export async function close() {
  await pool?.end();
  pool = null;
}

/** Borra las barberías de prueba (nombre "E2E …") con todo lo que tengan. */
export async function cleanupShops() {
  const shops = await sql<{ id: string }>(`SELECT id FROM barbershops WHERE name LIKE 'E2E %'`);
  for (const { id } of shops) {
    await sql(`DELETE FROM package_uses WHERE "saleId" IN (SELECT id FROM sales WHERE "shopId" = $1)`, [id]);
    await sql(`DELETE FROM customer_packages WHERE "shopId" = $1`, [id]);
    await sql(`DELETE FROM sales WHERE "shopId" = $1`, [id]);
    await sql(`DELETE FROM appointments WHERE "shopId" = $1`, [id]);
    await sql(`DELETE FROM barbershops WHERE id = $1`, [id]);
  }
  return shops.length;
}
