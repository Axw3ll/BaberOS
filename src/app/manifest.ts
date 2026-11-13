import type { MetadataRoute } from "next";

/** Permite "Agregar a pantalla de inicio" y abrir BarberOS como app, sin barra del navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BarberOS",
    short_name: "BarberOS",
    description: "Agenda, clientes y caja para tu barbería.",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6fa",
    theme_color: "#4f46e5",
    lang: "es-MX",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
