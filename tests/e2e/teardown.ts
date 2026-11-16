import { cleanupShops, cleanupTestDemos, close } from "./db";

export default async function teardown() {
  if (process.env.E2E_KEEP) return; // E2E_KEEP=1 deja la barbería de prueba para revisarla a mano
  const n = await cleanupShops();
  const d = await cleanupTestDemos();
  if (n || d) console.log(`Limpieza: ${n} barbería(s) de prueba y ${d} demo(s) borradas.`);
  await close();
}
