import Link from "next/link";
import QRCode from "qrcode";
import { Clock, MessageCircle, Smartphone, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { activeQueue, withEstimates } from "@/lib/queue";
import { baseUrl } from "@/lib/messages";
import { whatsappUrl } from "@/lib/crm";
import { Empty, Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { PrintButton } from "@/components/print-button";
import { addToQueue, callEntry, leftEntry, serveEntry } from "./actions";

export const metadata = { title: "Fila" };
export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const { shop } = await requireSection("fila");
  const base = await baseUrl();
  const link = `${base}/f/${shop.slug}`;
  const [queue, services, staff, qr] = await Promise.all([
    activeQueue(shop.id).then((q) => withEstimates(shop, q)),
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
  ]);
  const since = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="print:hidden">
        <PageHeader title="Fila" subtitle={queue.length ? `${queue.length} ${queue.length === 1 ? "persona esperando" : "personas esperando"} · se actualiza sola` : "Clientes sin cita esperando su turno."}
          actions={!shop.queueEnabled && <Link href="/ajustes#reglas" className="btn-quiet">Activar fila en línea</Link>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] print:block">
        <section className="print:hidden">
          <SectionTitle>En espera</SectionTitle>
          {queue.length === 0 ? <Empty title="Nadie en la fila">Cuando alguien se forme desde el QR o lo agregues aquí, aparecerá en orden.</Empty> : (
            <ul className="divide-y divide-line-soft">
              {queue.map((e) => (
                <li key={e.id} className={`py-4 ${e.status === "CALLED" ? "-mx-3 rounded-xl bg-success/5 px-3" : ""}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full font-display ${e.position === 1 ? "bg-brand text-on-brand" : "bg-brand-soft text-brand"}`}>{e.position}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">{e.name}{e.source === "ONLINE" ? <Smartphone className="size-3.5 text-faint" aria-label="Se formó desde su celular" /> : <UserRound className="size-3.5 text-faint" aria-label="Agregado en la barbería" />}</span>
                      <span className="block text-sm text-muted">
                        {e.serviceName ?? "Servicio por definir"}{e.staff ? ` · quiere con ${e.staff.name}` : ""} · <Clock className="inline size-3.5" /> espera {since(e.createdAt)} min
                        {e.status === "CALLED" ? <span className="font-medium text-success"> · ya lo llamaste</span> : e.waitMinutes ? ` · le faltan ~${e.waitMinutes} min` : ""}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      {e.phone && e.status === "WAITING" && (
                        <a href={whatsappUrl(e.phone, `Hola ${e.name.split(" ")[0]}, ¡ya te toca en ${shop.name}! Te esperamos.`)} target="_blank" rel="noopener"
                          className="btn border border-success/25 bg-success/10 py-1.5 text-success hover:bg-success/15"><MessageCircle className="size-4" />Avisar</a>
                      )}
                      {e.status === "WAITING" && <form action={callEntry}><input type="hidden" name="id" value={e.id} /><button className="btn-ghost text-sm">Ya lo llamé</button></form>}
                      <form action={leftEntry}><input type="hidden" name="id" value={e.id} /><button className="btn-ghost text-sm text-faint hover:text-danger">Se fue</button></form>
                    </div>
                  </div>
                  <ActionForm action={serveEntry} className="mt-3 flex flex-wrap items-center gap-2 pl-12">
                    <input type="hidden" name="id" value={e.id} />
                    <select name="staffId" defaultValue={e.staffId ?? ""} className="field w-auto py-1.5 text-sm" aria-label="Barbero">
                      <option value="">¿Quién lo atiende?</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select name="serviceId" defaultValue={e.serviceId ?? ""} className="field w-auto py-1.5 text-sm" aria-label="Servicio">
                      <option value="">Servicio…</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <Submit className="btn-primary py-1.5" pending="…">Pasar a la silla</Submit>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="print:hidden">
            <SectionTitle>Agregar a la fila</SectionTitle>
            <ActionForm action={addToQueue} resetOnOk className="space-y-3">
              <Field label="Nombre"><input name="name" required maxLength={60} className="field" /></Field>
              <Field label="WhatsApp" hint="Opcional: para avisarle cuando ya casi le toque"><input name="phone" inputMode="tel" className="field tnum" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <select name="serviceId" className="field text-sm" defaultValue="" aria-label="Servicio"><option value="">Servicio…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <select name="staffId" className="field text-sm" defaultValue="" aria-label="Barbero"><option value="">Cualquiera</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
              <Submit className="btn-quiet w-full">Agregar</Submit>
            </ActionForm>
          </section>

          {/* Cartel para la puerta: se imprime solo esta tarjeta */}
          <section className="print:border-0 print:shadow-none">
            <SectionTitle>QR para la puerta</SectionTitle>
            <div className="text-center">
              <p className="hidden font-display text-3xl print:block">{shop.name}</p>
              <p className="mb-4 font-display text-xl print:mt-4 print:text-4xl">¿Sin cita? Fórmate aquí</p>
              <span className="mx-auto block size-48 print:size-96 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR de la fila" />
              <p className="mt-3 text-sm text-muted print:text-xl">Escanea con tu cámara y te avisamos por WhatsApp</p>
            </div>
            <div className="mt-4 flex gap-2 print:hidden">
              <PrintButton label="Imprimir cartel" />
              <CopyButton text={link} label="Copiar enlace" />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
