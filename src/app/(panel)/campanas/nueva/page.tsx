import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { bookingUrl, customerStats, inSegment, QUICK_MESSAGES, SEGMENTS } from "@/lib/crm";
import { PageHeader } from "@/components/ui";
import { Composer } from "./composer";

export const metadata = { title: "Nueva campaña" };

export default async function NuevaCampanaPage({ searchParams }: { searchParams: Promise<{ seg?: string }> }) {
  const { shop } = await requireSection("campanas");
  const { seg } = await searchParams;
  const [stats, tags] = await Promise.all([
    customerStats(shop.id, { lostAfterDays: shop.lostAfterDays }),
    prisma.tag.findMany({ where: { shopId: shop.id }, orderBy: { name: "asc" } }),
  ]);
  const reachable = stats.filter((c) => c.acceptsMarketing);
  const audiences = [
    ...SEGMENTS.map((s) => ({ id: s.id as string, label: s.id === "todos" ? "Todos los clientes" : s.label })),
    ...tags.map((t) => ({ id: `tag:${t.id}`, label: `Etiqueta: ${t.name}` })),
  ].map((a) => ({ ...a, count: reachable.filter((c) => inSegment(c, a.id, shop.timezone)).length }));
  const initial = audiences.some((a) => a.id === seg) ? seg! : audiences.find((a) => a.id === "en_riesgo" && a.count)?.id ?? "todos";
  const sample = reachable.find((c) => inSegment(c, initial, shop.timezone)) ?? reachable[0];

  return (
    <>
      <PageHeader title="Nueva campaña" back={{ href: "/campanas", label: "Campañas" }} />
      <Composer
        audiences={audiences}
        initialAudience={initial}
        presets={QUICK_MESSAGES.filter((m) => m.id !== "noshow" && m.id !== "gracias").concat({
          id: "promo", label: "Promoción", text: "Hola {nombre}, esta semana en {barberia}: corte + barba con 20% de descuento. Aparta tu lugar: {enlace}",
        }, {
          id: "puntos", label: "Recordar puntos", text: "Hola {nombre}, tienes {puntos} puntos en {barberia}. Úsalos en tu próxima visita: {enlace}",
        })}
        sample={{ nombre: (sample?.name ?? "Carlos").split(" ")[0], barberia: shop.name, enlace: bookingUrl(shop.slug), puntos: String(sample?.points ?? 0) }}
      />
    </>
  );
}
