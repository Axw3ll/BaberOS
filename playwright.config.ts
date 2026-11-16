import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Pruebas de punta a punta: npm run test:e2e
// Necesitan la base de datos de desarrollo y DEV_AUTH_EMAIL en .env (entran sin contraseña).
// Crean una barbería "E2E …" desde cero, recorren todo y la borran al terminar. Tus datos no se tocan.
export default defineConfig({
  testDir: "tests/e2e",
  // Todo comparte una sola barbería: en orden y de uno en uno
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalTeardown: "./tests/e2e/teardown.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    // Si el navegador ya está instalado en otra ruta (p. ej. en un contenedor), se puede indicar aquí
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/privacidad",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
