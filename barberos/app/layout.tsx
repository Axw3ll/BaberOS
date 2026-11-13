import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "BarberOS", description: "Sistema para barberías: agenda, cobros, caja y lealtad" };
// Zoom con los dedos permitido: no se fija maximum-scale ni user-scalable
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d0d0f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
