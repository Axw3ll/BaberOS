"use client";
import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { api, Avatar, Loading, ROLES, useLoad } from "./ui";

type Pub = { shop: { name: string; isDemo: boolean }; members: { id: string; name: string; role: string; locked: boolean }[] };

export default function LockScreen({ slug, onUnlocked }: { slug: string; onUnlocked: (name: string, role: string) => void }) {
  const { data, error, reload } = useLoad<Pub>(`/api/public/${slug}`);
  const [sel, setSel] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data && !sel && data.members.length) setSel(data.members[0].id); }, [data, sel]);

  async function submit(p = pin) {
    if (!sel || p.length < 4 || busy) return;
    setBusy(true); setMsg("");
    try { const r = await api<{ name: string; role: string }>("/api/auth/login", { body: { slug, memberId: sel, pin: p } }); onUnlocked(r.name, r.role); }
    catch (e) { setMsg((e as Error).message); setPin(""); reload(); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (pin.length === 6) submit(pin); }, [pin]); // eslint-disable-line

  if (!data) return <div className="lock"><Loading error={error === "Barbería no encontrada" ? "No existe una barbería con ese identificador." : error} /><a className="btn" href="/">Volver</a></div>;
  const member = data.members.find((m) => m.id === sel);
  const press = (d: string) => pin.length < 6 && setPin(pin + d);

  return (
    <main className="lock">
      <div className="wordmark">BARBER<span>OS</span></div>
      <h2 style={{ textTransform: "uppercase", fontSize: 22, textAlign: "center" }} className="wrap">{data.shop.name}</h2>
      <p className="muted" style={{ textAlign: "center", maxWidth: 380 }}>Panel bloqueado. Elige tu nombre y entra con tu PIN: cada rol ve solo lo que le toca.</p>
      {data.shop.isDemo && <div className="notice gold small" style={{ maxWidth: 420 }}>Barbería demo · PIN dueño 1234 · recepción 2222 · barbero Luis 3333</div>}
      <div className="lock-inner mt">
        {data.members.map((m) => (
          <button key={m.id} className={`member ${sel === m.id ? "on" : ""}`} onClick={() => { setSel(m.id); setPin(""); setMsg(""); }}>
            <Avatar name={m.name} />
            <span className="t"><b>{m.name}</b><span>{ROLES[m.role]}</span></span>
            {m.locked ? <span className="tag bad">Bloqueado</span> : <span className="tag ok">Con PIN</span>}
          </button>
        ))}
        {member && (
          <div className="pin-card mt">
            <div style={{ textAlign: "center", fontWeight: 700 }} className="wrap">PIN de {member.name}</div>
            <div className="pin-dots" aria-label={`${pin.length} dígitos`}>{Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? "f" : ""} />)}</div>
            <div className="pin-show">{pin ? "•".repeat(pin.length) : "· · · ·"}</div>
            <div className="keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} disabled={busy} onClick={() => press(d)}>{d}</button>)}
              <button onClick={() => setPin("")} aria-label="Borrar todo">C</button>
              <button disabled={busy} onClick={() => press("0")}>0</button>
              <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Borrar"><Delete size={24} /></button>
            </div>
            {msg && <div className="notice red wrap">{msg}</div>}
            <button className="btn gold block" disabled={busy || pin.length < 4} onClick={() => submit()}>{busy ? "Entrando…" : "Entrar al panel"}</button>
            <p className="xs dim" style={{ textAlign: "center" }}>Después de 5 intentos fallidos el perfil se bloquea por 15 minutos.</p>
          </div>
        )}
        <a className="btn block mt" href={`/${slug}/reservar`}>Reservar una cita como cliente</a>
      </div>
    </main>
  );
}
