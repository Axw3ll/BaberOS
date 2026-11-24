import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

// Lista de páginas para Google: la página de venta y la de reservas de cada barbería real
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!site) return [];
  const shops = await prisma.barbershop.findMany({ where: { isDemo: false }, select: { slug: true, createdAt: true }, take: 5000 }).catch(() => []);
  return [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/registro`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${site}/terminos`, changeFrequency: "yearly", priority: 0.2 },
    ...shops.map((s) => ({ url: `${site}/b/${s.slug}`, lastModified: s.createdAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
