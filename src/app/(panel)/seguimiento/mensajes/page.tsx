import Link from "next/link";
import { Settings2 } from "lucide-react";
import { requireSection, canAccess, seesOnlyOwnAgenda } from "@/lib/auth";
import { KIND, pendingMessages, syncOutbox } from "@/lib/messages";
import { whatsappUrl } from "@/lib/crm";
import { dateTimeLabel } from "@/lib/time";
import { Empty, PageHeader, SectionTitle } from "@/components/ui";
import { skipMessage } from "./actions";
import { SendMessage } from "./send";
import type { MessageKind } from "@/generated/prisma/enums";

export const metadata = { title: "Mensajes por enviar" };

const ORDER: MessageKind[] = ["REMINDER_2H", "CONFIRMATION", "REMINDER_24H", "NO_SHOW", "REVIEW", "BIRTHDAY", "REBOOK"];

export default async function MensajesPage() {
  const { shop, me } = await requireSection("seguimiento");
  await syncOutbox(shop);
  const list = await pendingMessages(shop.id, seesOnlyOwnAgenda(me.role) ? { staffId: me.id } : {});
  const groups = ORDER.map((k) => ({ kind: k, items: list.filter((m) => m.kind === k) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader back={{ href: "/seguimiento", label: "Seguimiento" }} title="Mensajes por enviar"
        subtitle={list.length ? `${list.length} listos. Toca "Enviar" y se abre WhatsApp con el mensaje escrito.` : "Recordatorios, confirmaciones y avisos que el sistema prepara solo."}
        actions={canAccess(me.role, "ajustes") && <Link href="/ajustes#mensajes" className="btn-quiet"><Settings2 className="size-4" />Configurar</Link>} />

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
      <p className="mt-8 text-sm text-faint">
        Pronto: envío automático por WhatsApp Business, sin tocar nada. Mientras tanto, cada mensaje se manda con un toque desde tu teléfono.
      </p>
    </>
  );
}
