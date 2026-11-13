import type { Metadata } from "next";
import "@fontsource-variable/albert-sans/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BarberOS", template: "%s · BarberOS" },
  description: "Agenda, equipo, productos y ventas para tu barbería.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
