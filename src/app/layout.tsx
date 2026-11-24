import type { Metadata, Viewport } from "next";
import "@fontsource-variable/albert-sans/index.css";
import "./globals.css";

const site = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

export const metadata: Metadata = {
  ...(site && { metadataBase: new URL(site) }),
  title: { default: "BarberOS", template: "%s · BarberOS" },
  description: "Agenda, clientes, campañas y caja para tu barbería.",
  // Para comprobar en Google Search Console que la página es tuya (método "Etiqueta HTML")
  ...(process.env.GOOGLE_SITE_VERIFICATION && { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }),
  openGraph: { siteName: "BarberOS", locale: "es_MX", type: "website" },
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
