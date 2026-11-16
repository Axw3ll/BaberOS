import { cleanupShops, close } from "./db";

export default async function teardown() {
  if (process.env.E2E_KEEP) return; // E2E_KEEP=1 deja la barbería de prueba para revisarla a mano
  const n = await cleanupShops();
  if (n) console.log(`Limpieza: ${n} barbería(s) de prueba borrada(s).`);
  await close();
}
