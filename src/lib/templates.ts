/** Servicios típicos de barbería en México, con precios de referencia para empezar. */
export const SERVICE_TEMPLATES = [
  { key: "corte", name: "Corte clásico", minutes: 40, price: 180, on: true, description: "Tijera y máquina" },
  { key: "fade", name: "Degradado", minutes: 45, price: 220, on: true, description: "Fade bajo, medio o alto" },
  { key: "barba", name: "Arreglo de barba", minutes: 30, price: 140, on: true, description: "Toalla caliente y navaja" },
  { key: "combo", name: "Corte y barba", minutes: 75, price: 320, on: true, description: null },
  { key: "nino", name: "Corte de niño", minutes: 30, price: 150, on: true, description: "Hasta 12 años" },
  { key: "lineas", name: "Diseño o líneas", minutes: 15, price: 60, on: false, description: null },
  { key: "afeitado", name: "Afeitado clásico", minutes: 30, price: 180, on: false, description: "Con navaja y toalla caliente" },
  { key: "ceja", name: "Arreglo de ceja", minutes: 10, price: 50, on: false, description: null },
  { key: "mascarilla", name: "Mascarilla negra", minutes: 20, price: 120, on: false, description: null },
  { key: "tinte", name: "Tinte o canas", minutes: 45, price: 350, on: false, description: null },
] as const;
