"use client";
import type { Me } from "../Panel";
import { addDays, api, dayLabel, fmtDateTime, Loading, useAction, useLoad } from "../ui";

type R = { appointmentId: string; kind: "TODAY" | "TOMORROW"; time: string; client: string; phone: string; service: string; barber: string; message: string; link: string; sent: { at: string; by: string | null } | null };

export default function Reminders({ me }: { me: Me }) {
  const { data, error, reload } = useLoad<{ automatic: boolean; today: R[]; tomorrow: R[] }>("/api/reminders");
  const { run } = useAction();

  const Group = ({ title, sub, items, emptyTitle, emptyText }: { title: string; sub: string; items: R[]; emptyTitle: string; emptyText: string }) => (
    <div className="mt" style={{ marginTop: 22 }}>
      <h3 style={{ fontSize: 19 }}>{title}</h3>
      <p className="small dim mb">{sub}</p>
      {!items.length ? <div className="empty"><h3>{emptyTitle}</h3><p>{emptyText}</p></div> : (
        <div className="cards2">
          {items.map((r) => (
            <div key={r.appointmentId + r.kind} className="card stack">
              <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <div className="grow"><h3 className="wrap" style={{ fontSize: 18 }}>{r.client}</h3><div className="muted small wrap">{r.time} · {r.service.toUpperCase()} · {r.barber}</div></div>
                {r.sent ? <span className="tag ok">Enviado</span> : <span className="tag orange">Por enviar</span>}
              </div>
              <div className="card inset small muted" style={{ whiteSpace: "pre-wrap" }}>{r.message}</div>
              {r.sent && <div className="small ok">Avisado {fmtDateTime(r.sent.at, me.shop.timezone)}{r.sent.by ? ` por ${r.sent.by}` : ""}</div>}
              <div className="grid2">
                <a className="btn wa" href={r.link} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
                <button className="btn" disabled={!!r.sent} onClick={() => run(() => api("/api/reminders", { body: { appointmentId: r.appointmentId, kind: r.kind } }), "Marcado como enviado").then((x) => x && reload())}>{r.sent ? "Enviado" : "Marcar enviado"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="panel">
      <div className="sec-head"><h1>Recordatorios por WhatsApp</h1></div>
      <p className="muted">Menos citas olvidadas: confirma hoy las de mañana y las de más tarde.</p>
      <p className="muted mt">BarberOS no envía mensajes solo: abre WhatsApp con el texto ya escrito al teléfono del cliente y tú lo envías desde tu número. Al marcarlo como enviado queda registrado en la cita.</p>
      {!data ? <div className="mt"><Loading error={error} /></div> : <>
        <Group title={`Para mañana · ${dayLabel(addDays(me.shop.today, 1))}`} sub="Recordatorio de un día antes" items={data.tomorrow} emptyTitle="Sin citas para mañana" emptyText="Cuando haya citas agendadas para mañana, aquí aparecerán con su botón de WhatsApp." />
        <Group title={`Para hoy · ${dayLabel(me.shop.today)}`} sub="Recordatorio del mismo día, para las citas que aún no llegan" items={data.today} emptyTitle="Sin citas pendientes hoy" emptyText="Las citas de hoy que aún no llegan aparecerán aquí para su recordatorio corto." />
      </>}
    </section>
  );
}
