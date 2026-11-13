import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { dateLabel, toLocalDate } from "@/lib/time";
import { segmentLabel } from "@/lib/crm";
import { Empty, PageHeader, RowLink, Rows } from "@/components/ui";

export const metadata = { title: "Campañas" };

export default async function CampanasPage() {
  const { shop } = await requireSection("campanas");
  const [campaigns, tags] = await Promise.all([
    prisma.campaign.findMany({
      where: { shopId: shop.id },
      include: { createdBy: true, _count: { select: { recipients: true } }, recipients: { where: { sentAt: { not: null } }, select: { customerId: true, sentAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.tag.findMany({ where: { shopId: shop.id } }),
  ]);

  // Regresaron: destinatarios que tuvieron una visita después de recibir el mensaje
  const sent = campaigns.flatMap((c) => c.recipients.map((r) => ({ campaignId: c.id, customerId: r.customerId, at: r.sentAt! })));
  const visits = sent.length
    ? await prisma.appointment.findMany({
        where: { shopId: shop.id, status: "COMPLETED", customerId: { in: [...new Set(sent.map((s) => s.customerId))] },
          startsAt: { gte: new Date(Math.min(...sent.map((s) => s.at.getTime()))) } },
        select: { customerId: true, startsAt: true },
      })
    : [];
  const returned = (campaignId: string) => {
    const mine = sent.filter((s) => s.campaignId === campaignId);
    return mine.filter((s) => visits.some((v) => v.customerId === s.customerId && v.startsAt > s.at)).length;
  };

  return (
    <>
      <PageHeader title="Campañas" subtitle="Mensajes de WhatsApp a un grupo de clientes, uno por uno desde tu teléfono."
        actions={<Link href="/campanas/nueva" className="btn-primary">Nueva campaña</Link>} />

      {campaigns.length === 0 ? (
        <Empty title="Aún no hay campañas" action={<Link href="/campanas/nueva" className="btn-quiet">Crear la primera</Link>}>
          Por ejemplo: “Te extrañamos” a los clientes en riesgo, o una promoción de cumpleaños para los que cumplen este mes.
        </Empty>
      ) : (
        <Rows>
          {campaigns.map((c) => {
            const total = c._count.recipients, done = c.recipients.length, back = returned(c.id);
            return (
              <RowLink key={c.id} href={`/campanas/${c.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.name}</span>
                  <span className="block truncate text-sm text-ash">
                    {segmentLabel(c.audience, tags)} · {dateLabel(toLocalDate(c.createdAt, shop.timezone), { day: "numeric", month: "short" })}
                    {c.createdBy && ` · ${c.createdBy.name}`}
                  </span>
                </span>
                <span className="text-right text-sm tnum">
                  <span className="block">{done} de {total} enviados</span>
                  <span className="block text-ash">{back > 0 ? `${back} ${back === 1 ? "regresó" : "regresaron"}` : c.status === "DONE" ? "Terminada" : "En curso"}</span>
                </span>
              </RowLink>
            );
          })}
        </Rows>
      )}
    </>
  );
}
