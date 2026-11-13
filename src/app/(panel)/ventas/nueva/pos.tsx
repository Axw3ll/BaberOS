"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { chargeSale, lookupCustomer } from "../actions";
import { previewStampDiscount } from "@/lib/loyalty";

export type PosLine = {
  key: string; kind: "SERVICE" | "PRODUCT"; refId: string; name: string; price: number; quantity: number; staffId: string | null;
};
type Method = "CASH" | "CARD" | "TRANSFER";
const METHODS: { id: Method; label: string }[] = [
  { id: "CASH", label: "Efectivo" }, { id: "CARD", label: "Tarjeta" }, { id: "TRANSFER", label: "Transferencia" },
];

type Loyalty = {
  mode: "OFF" | "POINTS" | "STAMPS"; pesoPerPoint: number;
  stamps: { required: number; reward: string; value: number; min: number; label: string };
};
type CustomerLoyalty = { points: number; stamps: number; rewards: number };

export function Pos({ services, products, staff, me, appointmentId, initial, loyalty, customerLoyalty, initialCustomer }: {
  services: { id: string; name: string; price: number }[];
  products: { id: string; name: string; brand: string | null; price: number; stock: number }[];
  staff: { id: string; name: string }[];
  me: string; appointmentId: string | null; initial: PosLine[];
  loyalty: Loyalty; customerLoyalty: CustomerLoyalty | null;
  initialCustomer?: { phone: string; name: string } | null;
}) {
  const [tab, setTab] = useState<"SERVICE" | "PRODUCT">(initial.length ? "PRODUCT" : "SERVICE");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<PosLine[]>(initial);
  const [discount, setDiscount] = useState("");
  const [tip, setTip] = useState("");
  const [method, setMethod] = useState<Method>("CASH");
  const [received, setReceived] = useState("");
  const [phone, setPhone] = useState(initialCustomer?.phone ?? "");
  const [name, setName] = useState(initialCustomer?.name ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [known, setKnown] = useState<({ name: string } & CustomerLoyalty) | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [useReward, setUseReward] = useState(false);

  // Cliente sin cita: al escribir 10 dígitos busca si ya existe (nombre y puntos)
  useEffect(() => {
    if (appointmentId) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setKnown(null); return; }
    let live = true;
    lookupCustomer(digits).then((c) => {
      if (!live) return;
      setKnown(c);
      if (c) setName((n) => n || c.name);
    });
    return () => { live = false; };
  }, [phone, appointmentId]);

  const defaultStaff = staff.some((s) => s.id === me) ? me : null;
  const stockOf = (id: string) => products.find((p) => p.id === id)?.stock ?? 0;

  function add(kind: PosLine["kind"], refId: string, name: string, price: number) {
    setError("");
    setLines((ls) => {
      const found = ls.find((l) => l.kind === kind && l.refId === refId);
      if (found && kind === "PRODUCT") {
        return ls.map((l) => (l === found ? { ...l, quantity: Math.min(l.quantity + 1, stockOf(refId)) } : l));
      }
      return [...ls, { key: crypto.randomUUID(), kind, refId, name, price, quantity: 1, staffId: kind === "SERVICE" ? defaultStaff : null }];
    });
  }
  const update = (key: string, patch: Partial<PosLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const subtotal = lines.reduce((a, l) => a + l.price * l.quantity, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const cl = appointmentId ? customerLoyalty : known;
  const pointsMode = loyalty.mode === "POINTS" && loyalty.pesoPerPoint > 0;
  const balance = pointsMode ? cl?.points ?? null : null;
  const redeem = pointsMode && usePoints && balance
    ? Math.min(balance, Math.floor((subtotal - disc) / loyalty.pesoPerPoint))
    : 0;
  const pointsValue = pointsMode ? Math.round(redeem * loyalty.pesoPerPoint * 100) / 100 : 0;
  // Tarjeta de sellos
  const stampMode = loyalty.mode === "STAMPS";
  const servicePrices = lines.filter((l) => l.kind === "SERVICE").map((l) => l.price);
  const rewardValue = stampMode && useReward && cl && cl.rewards > 0
    ? previewStampDiscount({ stampReward: loyalty.stamps.reward, stampRewardValue: loyalty.stamps.value }, servicePrices, subtotal - disc)
    : 0;
  const willStamp = stampMode && Boolean(cl || phone.replace(/\D/g, "").length >= 10) && !rewardValue && servicePrices.length > 0
    && subtotal - disc >= loyalty.stamps.min;
  const total = subtotal - disc - pointsValue - rewardValue + (Number(tip) || 0);
  const change = method === "CASH" && Number(received) > total ? Number(received) - total : 0;

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const src = tab === "SERVICE"
      ? services.map((s) => ({ id: s.id, name: s.name, sub: "", price: s.price, disabled: false }))
      : products.map((p) => ({ id: p.id, name: p.name, sub: p.stock ? `${p.brand ? `${p.brand}, ` : ""}${p.stock} en existencia` : "Agotado", price: p.price, disabled: p.stock === 0 }));
    return term ? src.filter((x) => x.name.toLowerCase().includes(term)) : src;
  }, [tab, q, services, products]);

  function charge() {
    setError("");
    start(async () => {
      const res = await chargeSale({
        lines: lines.map((l) => l.kind === "SERVICE"
          ? { kind: "SERVICE", serviceId: l.refId, staffId: l.staffId ?? "", quantity: l.quantity }
          : { kind: "PRODUCT", productId: l.refId, staffId: l.staffId, quantity: l.quantity }),
        discount: disc, tip: Number(tip) || 0, method, appointmentId, redeemPoints: redeem, redeemReward: rewardValue > 0,
        customer: appointmentId ? null : { phone, name },
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div role="tablist" className="flex gap-6">
            {(["SERVICE", "PRODUCT"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${tab === t ? "bg-brand-soft text-brand" : "text-muted hover:text-fg"}`}>
                {t === "SERVICE" ? "Servicios" : "Productos"}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" className="field max-w-56 py-1.5" />
        </div>

        {list.length === 0 ? (
          <p className="py-10 text-muted">{q ? "Nada coincide con la búsqueda." : tab === "PRODUCT" ? "Aún no hay productos. Agrégalos en Productos." : "Aún no hay servicios."}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((x) => (
              <li key={x.id}>
                <button type="button" disabled={x.disabled} onClick={() => add(tab, x.id, x.name, x.price)}
                  className="card flex h-full w-full flex-col justify-between px-4 py-3 text-left transition hover:border-brand hover:shadow-pop disabled:opacity-40 disabled:hover:bg-transparent">
                  <span>{x.name}{x.sub && <span className="block text-sm text-muted">{x.sub}</span>}</span>
                  <span className="mt-3 text-sm font-semibold text-brand tnum">{money(x.price, true)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="lg:sticky lg:top-14 lg:self-start">
        <div className="card p-6">
          <p className="font-display text-xl">Ticket</p>
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Toca un servicio o producto para agregarlo.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line-soft">
              {lines.map((l) => (
                <li key={l.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm">{l.name}</span>
                    <span className="text-sm tnum">{money(l.price * l.quantity)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {l.kind === "PRODUCT" && (
                      <span className="flex items-center rounded-md border border-line text-sm">
                        <button type="button" className="px-2 py-1 text-muted hover:text-fg" aria-label="Quitar uno"
                          onClick={() => (l.quantity > 1 ? update(l.key, { quantity: l.quantity - 1 }) : remove(l.key))}>−</button>
                        <span className="w-6 text-center tnum">{l.quantity}</span>
                        <button type="button" className="px-2 py-1 text-muted hover:text-fg disabled:opacity-30" aria-label="Agregar uno"
                          disabled={l.quantity >= stockOf(l.refId)} onClick={() => update(l.key, { quantity: l.quantity + 1 })}>+</button>
                      </span>
                    )}
                    <select value={l.staffId ?? ""} onChange={(e) => update(l.key, { staffId: e.target.value || null })}
                      aria-label="Barbero" className="field min-w-0 flex-1 py-1 text-sm">
                      <option value="">{l.kind === "SERVICE" ? "¿Quién lo hizo?" : "Sin comisión"}</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button type="button" onClick={() => remove(l.key)} className="btn-ghost text-sm" aria-label={`Quitar ${l.name}`}>Quitar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line-soft pt-4">
            <label><span className="label">Descuento</span><input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="field py-1.5 tnum" placeholder="0" /></label>
            <label><span className="label">Propina</span><input inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} className="field py-1.5 tnum" placeholder="0" /></label>
          </div>

          {!appointmentId && (
            <details className="mt-4 text-sm" open={Boolean(initialCustomer)}>
              <summary className="cursor-pointer text-muted hover:text-fg">Registrar cliente (opcional)</summary>
              <div className="mt-3 grid gap-3">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Teléfono" aria-label="Teléfono" className="field py-1.5" />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" aria-label="Nombre" className="field py-1.5" />
                {known && <span className="text-success">Ya es cliente: {known.name}</span>}
              </div>
            </details>
          )}

          {stampMode && cl && cl.rewards > 0 && (
            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <span>
                <span className="block font-semibold">🎁 Tiene un premio: {loyalty.stamps.label}</span>
                <span className="text-muted">{servicePrices.length || loyalty.stamps.reward !== "FREE_SERVICE" ? "Márcalo para aplicarlo en este cobro" : "Agrega un servicio para aplicarlo"}</span>
              </span>
              <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
            </label>
          )}
          {stampMode && cl && (
            <p className="mt-3 text-sm text-muted">
              Tarjeta: {cl.stamps} de {loyalty.stamps.required} sellos{willStamp && <span className="text-success"> · +1 sello con este cobro</span>}
            </p>
          )}

          {pointsMode && balance != null && balance > 0 && (
            <label className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
              <span>
                <span className="block">Canjear puntos</span>
                <span className="text-muted tnum">Tiene {balance.toLocaleString("es-MX")} pts ≈ {money(balance * loyalty.pesoPerPoint)}</span>
              </span>
              <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
            </label>
          )}

          <fieldset className="mt-5">
            <legend className="label">Pago</legend>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-line p-1">
              {METHODS.map((m) => (
                <button key={m.id} type="button" aria-pressed={method === m.id} onClick={() => setMethod(m.id)}
                  className={`rounded px-2 py-1.5 text-sm transition-colors ${method === m.id ? "bg-brand text-on-brand shadow-xs" : "text-muted hover:text-fg"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            {method === "CASH" && (
              <label className="mt-3 block"><span className="label">Recibido</span>
                <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} className="field py-1.5 tnum" placeholder={String(total)} />
              </label>
            )}
          </fieldset>

          <dl className="mt-5 space-y-1 text-sm">
            {disc > 0 && <div className="flex justify-between text-muted"><dt>Descuento</dt><dd className="tnum">−{money(disc)}</dd></div>}
            {pointsValue > 0 && <div className="flex justify-between text-muted"><dt>{redeem} puntos</dt><dd className="tnum">−{money(pointsValue)}</dd></div>}
            {rewardValue > 0 && <div className="flex justify-between text-muted"><dt>Premio de la tarjeta</dt><dd className="tnum">−{money(rewardValue)}</dd></div>}
            <div className="flex items-baseline justify-between"><dt className="text-muted">Total</dt><dd className="font-display text-3xl tnum">{money(total)}</dd></div>
            {change > 0 && <div className="flex justify-between"><dt className="text-muted">Cambio</dt><dd className="tnum">{money(change)}</dd></div>}
          </dl>

          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <button type="button" onClick={charge} disabled={pending || lines.length === 0} className="btn-primary mt-5 w-full py-3">
            {pending ? "Cobrando…" : `Cobrar ${money(total)}`}
          </button>
        </div>
      </aside>
    </div>
  );
}
