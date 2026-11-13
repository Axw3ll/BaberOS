import type { Metadata, Viewport } from "next";
import "@fontsource-variable/albert-sans/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BarberOS", template: "%s · BarberOS" },
  description: "Agenda, clientes, campañas y caja para tu barbería.",
  appleWebApp: { capable: true, title: "BarberOS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
