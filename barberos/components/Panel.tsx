"use client";
import { useCallback, useEffect, useState } from "react";
import { Actions, api, Avatar, Field, Modal, ROLES, ToastProvider, useAction, useToast } from "./ui";
import { BarChart3, CalendarDays, CreditCard, MessageCircle, Scissors, Settings as Gear, Smartphone, User, Users, Wallet } from "lucide-react";
import LockScreen from "./LockScreen";
import Agenda from "./sections/Agenda";
import Reports from "./sections/Reports";
import Services from "./sections/Services";
import Clients from "./sections/Clients";
import Barbers from "./sections/Barbers";
import Booking from "./sections/Booking";
import Reminders from "./sections/Reminders";
import Cash from "./sections/Cash";
import Plans from "./sections/Plans";
import Settings from "./sections/Settings";

export type Me = {
  member: { id: string; name: string; role: string; barberId: string | null };
  perms: string[];
  shop: { id: string; slug: string; name: string; city: string; address: string | null; plan: string; phone: string; timezone: string; isDemo: boolean; today: string; depositEnabled: boolean; loyaltyStampsRequired: number; loyaltyDiscountPercent: number; openTime: string; closeTime: string; slotMinutes: number };
  barbers: { id: string; name: string }[];
  trial: { status: string; daysLeft: number } | null;
};

const SECTIONS = [
  { id: "agenda", label: "Agenda", Ic: CalendarDays, perms: ["agenda.all", "agenda.own"] },
  { id: "reminders", label: "Avisos", Ic: MessageCircle, perms: ["reminders"] },
  { id: "reports", label: "Reportes", Ic: BarChart3, perms: ["reports"] },
  { id: "cash", label: "Caja", Ic: Wallet, perms: ["cash.view", "products.sell"] },
  { id: "services", label: "Serv.", Ic: Scissors, perms: ["services"] },
  { id: "clients", label: "Clientes", Ic: Users, perms: ["clients"] },
  { id: "barbers", label: "Barberos", Ic: User, perms: ["barbers"] },
  { id: "booking", label: "Reserva", Ic: Smartphone, perms: ["booking"] },
  { id: "plans", label: "Planes", Ic: CreditCard, perms: ["plans"] },
  { id: "settings", label: "Ajustes", Ic: Gear, perms: ["settings"] },
] as const;
const PLAN: Record<string, string> = { BASICO: "Plan Básico", PRO: "Plan Pro", PREMIUM: "Plan Premium" };
export type SectionId = (typeof SECTIONS)[number]["id"];

function Inner({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "locked" | "in">("loading");
  const [sec, setSec] = useState<SectionId>("agenda");
  const [pinOpen, setPinOpen] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const m = await api<Me & { authenticated: boolean }>("/api/auth/me");
      if (m.shop.slug !== slug) { await api("/api/auth/logout", { body: {} }); setState("locked"); return; }
      setMe(m); setState("in");
    } catch { setMe(null); setState("locked"); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  const unlocked = async () => { await load(); };
  useEffect(() => {
    const h = () => { setMe(null); setState("locked"); };
    window.addEventListener("bos:locked", h);
    return () => window.removeEventListener("bos:locked", h);
  }, []);

  async function lock() {
    await api("/api/auth/logout", { body: {} }).catch(() => {});
    setMe(null); setState("locked"); setSec("agenda");
  }

  if (state === "loading") return <div className="lock muted">Cargando…</div>;
  if (state === "locked" || !me) return <LockScreen slug={slug} onUnlocked={async (name, role) => { await unlocked(); toast(`Hola, ${name}. Entraste como ${ROLES[role]}.`); }} />;

  const allowed = SECTIONS.filter((s) => s.perms.some((p) => me.perms.includes(p)));
  const current = allowed.find((s) => s.id === sec) ? sec : "agenda";
  const go = (s: SectionId) => { setSec(s); window.scrollTo(0, 0); };

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo-tile">B</span>
        <span className="wordmark">BARBER<span>OS</span></span>
        <div className="shop"><b>{me.shop.name}</b><span>{me.shop.city} · {PLAN[me.shop.plan] ?? ""}{me.shop.isDemo ? " · Demo" : ""}</span></div>
        <button className="who" onClick={() => setPinOpen(true)} title="Cambiar mi PIN">
          <Avatar name={me.member.name} sm />
          <span className="t"><b>{me.member.name.split(" ")[0]}</b><span>{ROLES[me.member.role]}</span></span>
        </button>
        <button className="btn sm lock-btn" onClick={lock}>Bloquear</button>
      </header>
      {me.trial?.status === "TRIALING" && me.perms.includes("plans") && (
        <div className="strip">Prueba gratuita: {me.trial.daysLeft > 0 ? `${me.trial.daysLeft} días restantes` : "terminó"} · <a href="#" onClick={(e) => { e.preventDefault(); go("plans"); }}>Ver planes</a></div>
      )}
      <main className="main">
        {current === "agenda" && <Agenda me={me} />}
        {current === "reports" && <Reports me={me} />}
        {current === "services" && <Services />}
        {current === "clients" && <Clients me={me} />}
        {current === "barbers" && <Barbers me={me} />}
        {current === "booking" && <Booking me={me} />}
        {current === "reminders" && <Reminders me={me} />}
        {current === "cash" && <Cash me={me} />}
        {current === "plans" && <Plans />}
        {current === "settings" && <Settings me={me} onSaved={load} go={go} />}
        <div className="footer"><b>BarberOS</b> · Sistema de agenda y cobros para barberías · {me.shop.name}</div>
      </main>
      {allowed.length > 1 && (
        <nav className="bottomnav" aria-label="Secciones">
          {allowed.map(({ id, label, Ic }) => (
            <button key={id} className={current === id ? "on" : ""} onClick={() => go(id)} aria-current={current === id ? "page" : undefined} aria-label={label}>
              <Ic size={22} strokeWidth={1.7} /><span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
    </div>
  );
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const { run, busy } = useAction();
  const [err, setErr] = useState("");
  return (
    <Modal title="Cambiar mi PIN" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault(); setErr("");
        if (n1 !== n2) return setErr("Los PIN nuevos no coinciden");
        const r = await run(() => api("/api/me/pin", { body: { currentPin: cur, newPin: n1 } }), "PIN actualizado");
        if (r) onClose();
      }}>
        <Field label="PIN actual"><input type="password" inputMode="numeric" maxLength={6} value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="PIN nuevo (4 a 6 dígitos)"><input type="password" inputMode="numeric" maxLength={6} value={n1} onChange={(e) => setN1(e.target.value)} /></Field>
        <Field label="Repite el PIN nuevo"><input type="password" inputMode="numeric" maxLength={6} value={n2} onChange={(e) => setN2(e.target.value)} /></Field>
        {err && <div className="notice red">{err}</div>}
        <Actions onCancel={onClose} busy={busy} />
      </form>
    </Modal>
  );
}

export default function Panel({ slug }: { slug: string }) {
  return <ToastProvider><Inner slug={slug} /></ToastProvider>;
}
