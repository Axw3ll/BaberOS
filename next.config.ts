import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // El indicador de Next.js tapaba la barra inferior en celular (solo en desarrollo)
  devIndicators: false,
};

export default nextConfig;
