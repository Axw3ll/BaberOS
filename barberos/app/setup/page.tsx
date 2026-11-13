"use client";
import { useState } from "react";
import { api, Field, ToastProvider, useAction } from "@/components/ui";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function Setup() {
  const [f, setF] = useState({ name: "", city: "", phone: "", timezone: "America/Mexico_City", openTime: "09:00", closeTime: "20:00", ownerName: "", ownerEmail: "", ownerPhone: "", pin: "", pin2: "" });
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6]);
  const [err, setErr] = useState("");
  const { run, busy } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!/^\d{4,6}$/.test(f.pin)) return setErr("El PIN debe tener de 4 a 6 dígitos.");
    if (f.pin !== f.pin2) return setErr("Los PIN no coinciden.");
    const { pin2, ...data } = f;
    const r = await run(() => api<{ slug: string }>("/api/setup", { body: { ...data, workDays: days } }));
    if (r) window.location.href = `/${r.slug}`;
  }

  return (
    <main className="main" style={{ maxWidth: 560 }}>
      <div className="wordmark" style={{ fontSize: 44, textAlign: "center", marginTop: 16 }}>BARBER<span>OS</span></div>
      <h1 style={{ textAlign: "center", marginTop: 10 }}>Configura tu barbería</h1>
      <p className="muted" style={{ textAlign: "center" }}>Tendrás 14 días de prueba gratis. Después eliges un plan.</p>
      <form className="stack mt" onSubmit={submit}>
        <div className="panel stack">
          <h2>La barbería</h2>
          <Field label="Nombre de la barbería"><input required value={f.name} onChange={set("name")} /></Field>
          <div className="grid2">
            <Field label="Ciudad o zona"><input required value={f.city} onChange={set("city")} /></Field>
            <Field label="Teléfono del local (10 dígitos)"><input required inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
          </div>
          <Field label="Zona horaria">
            <select value={f.timezone} onChange={set("timezone")}>
              {["America/Mexico_City", "America/Monterrey", "America/Guadalajara", "America/Merida", "America/Cancun", "America/Chihuahua", "America/Mazatlan", "America/Hermosillo", "America/Tijuana"].map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <div className="grid2">
            <Field label="Abre"><input type="time" value={f.openTime} onChange={set("openTime")} /></Field>
            <Field label="Cierra"><input type="time" value={f.closeTime} onChange={set("closeTime")} /></Field>
          </div>
          <div className="f"><span className="muted small">Días que abre</span>
            <div className="chips">{DAYS.map((d, i) => (
              <button type="button" key={d} className={`pill ${days.includes(i) ? "on" : ""}`} style={{ paddingInline: 14 }} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{d}</button>
            ))}</div>
          </div>
        </div>
        <div className="panel stack">
          <h2>El dueño</h2>
          <Field label="Nombre"><input required value={f.ownerName} onChange={set("ownerName")} /></Field>
          <div className="grid2">
            <Field label="Correo (opcional)"><input type="email" value={f.ownerEmail} onChange={set("ownerEmail")} /></Field>
            <Field label="Celular (opcional)"><input inputMode="tel" value={f.ownerPhone} onChange={set("ownerPhone")} /></Field>
          </div>
          <div className="grid2">
            <Field label="Tu PIN (4 a 6 dígitos)"><input required type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={set("pin")} /></Field>
            <Field label="Repite el PIN"><input required type="password" inputMode="numeric" maxLength={6} value={f.pin2} onChange={set("pin2")} /></Field>
          </div>
          <p className="muted small">Con este PIN entrarás al panel. Se guarda cifrado en el servidor.</p>
        </div>
        {err && <div className="notice red">{err}</div>}
        <button className="btn gold block" disabled={busy}>{busy ? "Creando…" : "Crear barbería"}</button>
      </form>
    </main>
  );
}

export default function Page() { return <ToastProvider><Setup /></ToastProvider>; }
