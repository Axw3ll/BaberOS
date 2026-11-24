import type { MetadataRoute } from "next";

const site = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

// Google puede ver la página de venta y las páginas de reserva de cada barbería; el panel no
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/b/"], disallow: ["/api/", "/admin", "/auth/", "/c/", "/mi/", "/f/", "/unirse/", "/demo/", "/cuenta/", "/onboarding", "/suscripcion"] },
    ...(site && { sitemap: `${site}/sitemap.xml` }),
  };
}
