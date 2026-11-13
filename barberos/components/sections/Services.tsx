"use client";
import { useState } from "react";
import { Actions, api, Empty, Field, Loading, Modal, money, pesos, Section, toCents, useAction, useLoad } from "../ui";

type Svc = { id: string; name: string; description: string | null; price: number; durationMin: number; active: boolean };

export default function Services() {
  const { data, error, reload } = useLoad<{ services: Svc[] }>("/api/services");
  const [edit, setEdit] = useState<Svc | "new" | null>(null);
  const { run } = useAction();
  return (
    <Section title="Servicios">
      <p className="muted mb">Precios y duraciones que ven tus clientes al reservar</p>
      <div className="row end mb"><button className="btn gold" onClick={() => setEdit("new")}>+ Nuevo servicio</button></div>
      {!data ? <Loading error={error} /> : !data.services.length ? <Empty title="Aún no hay servicios">Crea el primero para que tus clientes puedan reservar.</Empty> : (
        <div className="cards2">
          {data.services.map((s) => (
            <div key={s.id} className={`card stack ${s.active ? "" : "inactive"}`}>
              <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="grow">
                  <h3 className="wrap" style={{ textTransform: "uppercase", fontSize: 18 }}>{s.name}</h3>
                  {s.description && <p className="small muted wrap" style={{ marginTop: 4 }}>{s.description}</p>}
                  <p className="muted" style={{ marginTop: 6 }}>{s.durationMin} min</p>
                </div>
                <div className="right stack-s" style={{ justifyItems: "end" }}>
                  <span className="b" style={{ fontSize: 20 }}>{money(s.price)}</span>
                  <span className={`tag ${s.active ? "ok" : "bad"}`}>{s.active ? "Activo" : "Inactivo"}</span>
                </div>
              </div>
              <div className="grid2">
                <button className="btn" onClick={() => setEdit(s)}>Editar</button>
                <button className={`btn ${s.active ? "" : "wa"}`} onClick={() => run(() => api(`/api/services/${s.id}`, { method: "PATCH", body: { active: !s.active } }), s.active ? "Servicio desactivado" : "Servicio activado").then((r) => r && reload())}>{s.active ? "Desactivar" : "Activar"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <ServiceForm s={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </Section>
  );
}

function ServiceForm({ s, onClose, onSaved }: { s: Svc | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(s?.name ?? "");
  const [description, setDescription] = useState(s?.description ?? "");
  const [price, setPrice] = useState(s ? pesos(s.price) : "");
  const [dur, setDur] = useState(String(s?.durationMin ?? 30));
  const { run, busy } = useAction();
  return (
    <Modal title={s ? "Editar servicio" : "Nuevo servicio"} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        const body = { name, description: description || null, price: toCents(price), durationMin: Number(dur) };
        const r = await run(() => s ? api(`/api/services/${s.id}`, { method: "PATCH", body }) : api("/api/services", { body }), "Servicio guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Corte + barba" /></Field>
        <Field label="Descripción (opcional)"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Corte de pelo clásico y arreglo de barba" /></Field>
        <div className="grid2">
          <Field label="Precio (MXN)"><input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="250" /></Field>
          <Field label="Duración (min)"><input required type="number" min={5} step={5} value={dur} onChange={(e) => setDur(e.target.value)} /></Field>
        </div>
        <Actions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}
