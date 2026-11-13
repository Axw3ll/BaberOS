import Link from "next/link";
import { Send, Settings2, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { whatsappEnabled } from "@/lib/whatsapp";
import { requireSection, canAccess, seesOnlyOwnAgenda } from "@/lib/auth";
import { KIND, pendingMessages, syncOutbox } from "@/lib/messages";
import { whatsappUrl } from "@/lib/crm";
import { dateTimeLabel } from "@/lib/time";
import { Empty, PageHeader, SectionTitle } from "@/components/ui";
import { sendAllNow, skipMessage } from "./actions";
import { SendMessage } from "./send";
import type { MessageKind } from "@/generated/prisma/enums";

export const metadata = { title: "Mensajes por enviar" };

const ORDER: MessageKind[] = ["REMINDER_2H", "CONFIRMATION", "REMINDER_24H", "NO_SHOW", "REVIEW", "STAMP_REWARD", "STAMP_ALMOST", "BIRTHDAY", "REBOOK"];

export default async function MensajesPage() {
  const { shop, me } = await requireSection("seguimiento");
  await syncOutbox(shop);
  const list = await pendingMessages(shop.id, seesOnlyOwnAgenda(me.role) ? { staffId: me.id } : {});
  const groups = ORDER.map((k) => ({ kind: k, items: list.filter((m) => m.kind === k) })).filter((g) => g.items.length);
  const auto = whatsappEnabled();
  const failed = auto ? await prisma.outboundMessage.findMany({
    where: { shopId: shop.id, status: "SKIPPED", error: { not: null }, createdAt: { gt: new Date(Date.now() - 3 * 86_400_000) } },
    include: { customer: { select: { id: true, name: true, phone: true } } }, orderBy: { createdAt: "desc" }, take: 20,
  }) : [];

  return (
    <>
      <PageHeader back={{ href: "/seguimiento", label: "Seguimiento" }} title="Mensajes por enviar"
        subtitle={list.length ? `${list.length} listos. Toca "Enviar" y se abre WhatsApp con el mensaje escrito.` : "Recordatorios, confirmaciones y avisos que el sistema prepara solo."}
        actions={
          <>
            {auto && list.length > 0 && me.role !== "BARBER" && (
              <form action={sendAllNow}><button className="btn-primary"><Send className="size-4" />Enviar ahora</button></form>
            )}
            {canAccess(me.role, "ajustes") && <Link href="/ajustes#mensajes" className="btn-quiet"><Settings2 className="size-4" />Configurar</Link>}
          </>
        } />
      {auto && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm text-success">
          <Zap className="size-4" />WhatsApp conectado: estos mensajes se envían solos. También puedes mandarlos tú desde aquí.
        </p>
      )}

      {groups.length === 0 ? (
        <Empty title="Todo enviado">Cuando haya citas por recordar, reservas nuevas o clientes que cumplan años, aparecerán aquí.</Empty>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.kind}>
              <SectionTitle aside={g.items.length}>{KIND[g.kind].label}</SectionTitle>
              <ul className="divide-y divide-line-soft">
                {g.items.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/clientes/${m.customer.id}`} className="font-medium hover:text-brand">{m.customer.name}</Link>
                      {m.appointment && <span className="text-sm text-muted"> · cita {dateTimeLabel(m.appointment.startsAt, shop.timezone)} con {m.appointment.staff.name}</span>}
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{m.body}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <SendMessage id={m.id} url={whatsappUrl(m.customer.phone, m.body)} />
                      <form action={skipMessage}><input type="hidden" name="id" value={m.id} /><button className="btn-ghost text-sm">Omitir</button></form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <section className="mt-6">
          <SectionTitle aside="Mándalos tú si hace falta">No se pudieron enviar</SectionTitle>
          <ul className="divide-y divide-line-soft text-sm">
            {failed.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span><Link href={`/clientes/${m.customer.id}`} className="font-medium hover:text-brand">{m.customer.name}</Link> <span className="text-danger">· {m.error}</span></span>
                <a href={whatsappUrl(m.customer.phone, m.body)} target="_blank" rel="noopener" className="btn-ghost text-sm">Abrir WhatsApp</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!auto && (
        <p className="mt-8 text-sm text-faint">
          Cada mensaje se manda con un toque desde tu teléfono. Cuando conectes WhatsApp Business, se enviarán solos.
        </p>
      )}
    </>
  );
}
