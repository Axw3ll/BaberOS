import Link from "next/link";
import { CalendarCheck, Clock, Send, TrendingUp, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { dateLabel, dateTimeLabel, toLocalDate } from "@/lib/time";
import { bookingUrl, fillTemplate, segmentLabel, whatsappUrl } from "@/lib/crm";
import { Figure, PageHeader, SectionTitle } from "@/components/ui";
import { closeCampaign, deleteCampaign } from "../actions";
import { SendButton } from "./send-button";

export const metadata = { title: "Campaña" };

export default async function CampanaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  const { id } = await params;
  const { ver } = await searchParams;
  const { shop } = await requireSection("campanas");
  const c = await prisma.campaign.findFirst({
    where: { id, shopId: shop.id },
    include: { recipients: { include: { customer: true }, orderBy: { customer: { name: "asc" } } }, createdBy: true },
  });
  if (!c) notFound();
  const tags = await prisma.tag.findMany({ where: { shopId: shop.id } });
  const tz = shop.timezone;

  const sentList = c.recipients.filter((r) => r.sentAt);
  const firstSent = sentList.reduce<Date | null>((m, r) => (!m || r.sentAt! < m ? r.sentAt! : m), null);
  const visits = firstSent
    ? await prisma.appointment.findMany({
        where: { shopId: shop.id, customerId: { in: sentList.map((r) => r.customerId) }, startsAt: { gte: firstSent },
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } },
        select: { customerId: true, startsAt: true, createdAt: true, status: true },
      })
    : [];
  // Respondió = agendó o vino después de recibir el mensaje
  const responded = new Set(sentList.filter((r) => visits.some((v) => v.customerId === r.customerId && v.createdAt > r.sentAt!)).map((r) => r.customerId));
  const pending = c.recipients.filter((r) => !r.sentAt);
  const shown = ver === "enviados" ? sentList : ver === "todos" ? c.recipients : pending.length ? pending : c.recipients;
  const link = bookingUrl(shop.slug);

  return (
    <>
      <PageHeader back={{ href: "/campanas", label: "Campañas" }} title={c.name}
        subtitle={`${segmentLabel(c.audience, tags)} · creada el ${dateLabel(toLocalDate(c.createdAt, tz), { day: "numeric", month: "long" })}${c.createdBy ? ` por ${c.createdBy.name}` : ""}`}
        actions={c.status !== "DONE" && (
          <form action={closeCampaign}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost">Dar por terminada</button></form>
        )} />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        <Figure value={c.recipients.length} label="Destinatarios" icon={Users} />
        <Figure value={sentList.length} label="Enviados" icon={Send} tone="success" />
        <Figure value={pending.length} label="Por enviar" icon={Clock} tone="warning" />
        <Figure value={responded.size} label="Agendaron después" icon={CalendarCheck} tone="success" />
        {sentList.length > 0 && <Figure value={`${Math.round((responded.size / sentList.length) * 100)}%`} label="Respuesta" icon={TrendingUp} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0">
          <SectionTitle aside={
            <nav className="flex gap-3">
              {[["", "Por enviar"], ["enviados", "Enviados"], ["todos", "Todos"]].map(([k, l]) => (
                <Link key={k} href={`/campanas/${c.id}${k ? `?ver=${k}` : ""}`} className={(ver ?? "") === k ? "text-fg" : "hover:text-fg"}>{l}</Link>
              ))}
            </nav>
          }>Destinatarios</SectionTitle>
          {shown.length === 0 ? <p className="text-muted">Nadie en esta lista.</p> : (
            <ul className="divide-y divide-line-soft">
              {shown.map((r) => {
                const text = fillTemplate(c.message, { nombre: r.customer.name, barberia: shop.name, enlace: link, puntos: r.customer.points });
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <span className="min-w-0 flex-1">
                      <Link href={`/clientes/${r.customerId}`} className="hover:text-fg">{r.customer.name}</Link>
                      <span className="block text-sm text-muted tnum">
                        {r.customer.phone}
                        {r.sentAt && ` · enviado ${dateTimeLabel(r.sentAt, tz)}`}
                        {responded.has(r.customerId) && <span className="text-success"> · agendó</span>}
                      </span>
                    </span>
                    <SendButton recipientId={r.id} url={whatsappUrl(r.customer.phone, text)} sent={Boolean(r.sentAt)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="space-y-6">
          <section>
            <SectionTitle>Mensaje</SectionTitle>
            <p className="rounded-lg border border-line bg-hover p-4 text-sm whitespace-pre-line">{c.message}</p>
          </section>
          <form action={deleteCampaign}>
            <input type="hidden" name="id" value={c.id} />
            <button className="text-sm text-faint hover:text-danger">Borrar campaña</button>
          </form>
        </aside>
      </div>
    </>
  );
}
