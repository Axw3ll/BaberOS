"use client";
import { useState } from "react";
import type { Me } from "../Panel";
import { Actions, addDays, api, CATS, dayLabel, Empty, Field, HBar, Kpi, Loading, longDate, MethodPicker, METHODS, Modal, money, pesos, toCents, useAction, useLoad } from "../ui";

export default function Cash({ me }: { me: Me }) {
  const full = me.perms.includes("cash.view");
  const [tab, setTab] = useState<"corte" | "productos" | "gastos">(full ? "corte" : "productos");
  const [date, setDate] = useState(me.shop.today);
  return (
    <section className="panel">
      <div className="sec-head"><h1>Caja</h1>{tab === "corte" && <span className="sub">{longDate(date)}</span>}</div>
      {tab === "corte" && (
        <div className="row end mb" style={{ flexWrap: "nowrap" }}>
          <button className="btn icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">←</button>
          <button className="btn icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">→</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ maxWidth: 190 }} aria-label="Fecha" />
        </div>
      )}
      <div className="seg mb">
        {full && <button className={`pill ${tab === "corte" ? "on" : ""}`} onClick={() => setTab("corte")}>Corte del día</button>}
        <button className={`pill ${tab === "productos" ? "on" : ""}`} onClick={() => setTab("productos")}>Productos</button>
        {me.perms.includes("expenses") && <button className={`pill ${tab === "gastos" ? "on" : ""}`} onClick={() => setTab("gastos")}>Gastos</button>}
      </div>
      {tab === "corte" && full && <Corte me={me} date={date} />}
      {tab === "productos" && <Products me={me} />}
      {tab === "gastos" && <Expenses me={me} />}
    </section>
  );
}

function Corte({ me, date }: { me: Me; date: string }) {
  const { data, error, reload } = useLoad<{ totals: any; closure: any }>(`/api/cash?date=${date}`);
  const [closing, setClosing] = useState(false);
  if (!data) return <Loading error={error} />;
  const t = data.totals;
  const methods = Object.keys(METHODS).filter((k) => t.byMethod[k] > 0);
  const maxM = Math.max(1, ...methods.map((k) => t.byMethod[k]));
  const cats = Object.entries(t.expenseByCategory as Record<string, number>);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Ingresos del día" value={money(t.income)} />
        <Kpi label="Gastos del día" value={money(t.expenses)} />
        <Kpi label="Neto del día" value={money(t.net)} cls={t.net >= 0 ? "ok" : "bad"} />
        <Kpi label="Efectivo esperado" value={money(t.expectedCash)} />
      </div>

      {data.closure ? (
        <div className="card hl stack-s">
          <div className="card-title">Caja cerrada</div>
          <div className="lines">
            <div><span>Efectivo esperado</span><span className="n">{money(data.closure.expectedCash)}</span></div>
            <div><span>Efectivo contado</span><span className="n">{money(data.closure.countedCash)}</span></div>
            <div><b>Diferencia</b><span className={`n ${data.closure.difference === 0 ? "ok" : "bad"}`}>{data.closure.difference > 0 ? "+" : ""}{money(data.closure.difference)}{data.closure.difference === 0 ? " · cuadra" : data.closure.difference < 0 ? " · falta" : " · sobra"}</span></div>
            <div><span>Neto al cierre</span><span className="n">{money(data.closure.net)}</span></div>
          </div>
        </div>
      ) : (
        <div className="card dashed row between" style={{ flexWrap: "nowrap" }}>
          <p className="grow"><b>La caja de este día sigue abierta.</b> <span className="muted">Al cerrar, cuentas el efectivo y el sistema te dice si cuadra.</span></p>
          {me.perms.includes("cash.close") && <button className="btn gold" style={{ flex: "0 0 auto" }} onClick={() => setClosing(true)}>Cerrar caja</button>}
        </div>
      )}

      <div className="card">
        <div className="card-title">De dónde entró el dinero</div>
        <div className="lines mt">
          <div><span>Servicios cobrados</span><span className="n">{money(t.services)}</span></div>
          <div><span>Anticipos recibidos</span><span className="n">{money(t.deposits)}</span></div>
          <div><span>Productos ({t.productUnits} pieza{t.productUnits === 1 ? "" : "s"})</span><span className="n">{money(t.products)}</span></div>
        </div>
        <div className="label-up mt mb">Por método de pago</div>
        {!methods.length ? <p className="muted">Sin cobros este día.</p> : methods.map((k) => <HBar key={k} name={METHODS[k]} value={t.byMethod[k]} max={maxM} label={money(t.byMethod[k])} />)}
        {t.pendingDeposits.count > 0 && <p className="small warn mt">Anticipos pendientes de cobro: {t.pendingDeposits.count} · {money(t.pendingDeposits.amount)}</p>}
      </div>

      <div className="card">
        <div className="card-title">Comisiones por barbero</div>
        <div className="card-sub">Sobre lo cobrado en servicios y anticipos aplicados de este día</div>
        {!t.commissions.length ? <p className="muted mt">Sin servicios cobrados.</p> : (
          <div className="lines mt">
            {t.commissions.map((c: any) => (
              <div key={c.barberId}>
                <div className="grow"><b className="wrap" style={{ textTransform: "uppercase" }}>{c.name}</b><div className="small muted">{c.count} cita{c.count === 1 ? "" : "s"} · generó {money(c.revenue)}</div></div>
                <div className="right"><b>{money(c.commission)}</b><div className="small muted">comisión {c.pct}%</div></div>
              </div>
            ))}
          </div>
        )}
        <div className="label-up mt mb">Gastos por categoría</div>
        {!cats.length ? <p className="muted">Sin gastos este día.</p> : <div className="lines">{cats.map(([k, v]) => <div key={k}><span>{CATS[k]}</span><span className="n">{money(v)}</span></div>)}</div>}
      </div>

      <div className="card">
        <div className="card-title">Ventas de productos del día</div>
        {!t.salesList.length ? <p className="muted mt">Sin ventas de productos este día. Vende desde la pestaña Productos.</p> : (
          <div className="lines mt">{t.salesList.map((s: any) => <div key={s.id}><span className="wrap">{s.product} ×{s.qty} <span className="small muted">· {METHODS[s.method]}</span></span><span className="n">{money(s.total)}</span></div>)}</div>
        )}
      </div>
      {closing && <CloseForm date={date} expected={t.expectedCash} onClose={() => setClosing(false)} onSaved={() => { setClosing(false); reload(); }} />}
    </div>
  );
}

function CloseForm({ date, expected, onClose, onSaved }: { date: string; expected: number; onClose: () => void; onSaved: () => void }) {
  const [counted, setCounted] = useState("");
  const { run, busy } = useAction();
  const diff = toCents(counted) - expected;
  return (
    <Modal title="Cerrar caja" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api("/api/cash/close", { body: { date, countedCash: toCents(counted) } }), "Caja cerrada"); if (r) onSaved(); }}>
        <p className="muted">{longDate(date)}. Cuenta el efectivo que hay en caja. Una vez cerrada no se puede reabrir.</p>
        <div className="lines"><div><span>Efectivo esperado</span><span className="n">{money(expected)}</span></div></div>
        <Field label="Efectivo contado (MXN)"><input required inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" autoFocus /></Field>
        {counted !== "" && <p>Diferencia: <b className={diff === 0 ? "ok" : "bad"}>{diff > 0 ? "+" : ""}{money(diff)}</b> {diff === 0 ? "· cuadra" : diff < 0 ? "· falta efectivo" : "· sobra efectivo"}</p>}
        <Actions onCancel={onClose} busy={busy} label="Cerrar caja" disabled={counted === ""} />
      </form>
    </Modal>
  );
}

type P = { id: string; name: string; price: number; cost?: number; margin?: number; marginPct?: number; stock: number; lowStockAlert: number; active: boolean; stockState: "ok" | "low" | "out" };

function Products({ me }: { me: Me }) {
  const { data, error, reload } = useLoad<{ products: P[] }>("/api/products");
  const manage = me.perms.includes("products.manage");
  const [edit, setEdit] = useState<P | "new" | null>(null);
  const [stock, setStock] = useState<P | null>(null);
  const [sell, setSell] = useState<P | null>(null);
  const list = (data?.products ?? []).filter((p) => manage || p.active);
  return (
    <div>
      {manage && <button className="btn gold block mb" onClick={() => setEdit("new")}>+ Nuevo producto</button>}
      {!data ? <Loading error={error} /> : !list.length ? <Empty title="Sin productos">Agrega los productos que vendes en el local: pomadas, aceites, shampoo.</Empty> : (
        <div className="cards2">
          {list.map((p) => (
            <div key={p.id} className={`card stack ${p.active ? "" : "inactive"}`} style={p.stockState !== "ok" ? { borderColor: "#6b3428" } : undefined}>
              <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <div className="grow">
                  <h3 className="wrap" style={{ fontSize: 18 }}>{p.name}</h3>
                  {p.cost !== undefined && <div className="small muted">Costo {money(p.cost)} · Margen {money(p.margin!)} ({p.marginPct}%)</div>}
                </div>
                <b style={{ fontSize: 19 }}>{money(p.price)}</b>
              </div>
              <div>{p.stockState === "out" ? <span className="tag bad">Agotado</span> : p.stockState === "low" ? <span className="tag bad">Stock bajo · {p.stock}</span> : <span className="tag ok">Stock {p.stock}</span>}</div>
              <div className={manage ? "grid2" : ""}>
                <button className="btn gold block" disabled={!p.active || p.stock === 0} onClick={() => setSell(p)}>Vender</button>
                {manage && <button className="btn" onClick={() => setStock(p)}>Ajustar stock</button>}
                {manage && <button className="btn" style={{ gridColumn: "1 / -1" }} onClick={() => setEdit(p)}>Editar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <ProductForm p={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {stock && <StockForm p={stock} onClose={() => setStock(null)} onSaved={() => { setStock(null); reload(); }} />}
      {sell && <SellForm p={sell} onClose={() => setSell(null)} onSaved={() => { setSell(null); reload(); }} />}
    </div>
  );
}

function SellForm({ p, onClose, onSaved }: { p: P; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(1); const [method, setMethod] = useState("CASH");
  const { run, busy } = useAction();
  return (
    <Modal title={`Vender ${p.name}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api(`/api/products/${p.id}/sell`, { body: { qty, method } }), "Venta registrada"); if (r) onSaved(); }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button type="button" className="btn icon-btn" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
          <span className="display" style={{ fontSize: 40, minWidth: 50, textAlign: "center" }}>{qty}</span>
          <button type="button" className="btn icon-btn" disabled={qty >= p.stock} onClick={() => setQty(qty + 1)}>+</button>
          <span className="muted small">de {p.stock} disponibles</span>
        </div>
        <MethodPicker value={method} onChange={setMethod} />
        <Actions onCancel={onClose} busy={busy} label={`Cobrar ${money(p.price * qty)}`} />
      </form>
    </Modal>
  );
}

function StockForm({ p, onClose, onSaved }: { p: P; onClose: () => void; onSaved: () => void }) {
  const [dir, setDir] = useState<1 | -1>(1); const [n, setN] = useState("1"); const [reason, setReason] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal title={`Ajustar stock: ${p.name}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api(`/api/products/${p.id}/stock`, { body: { delta: dir * Number(n), reason } }), "Stock ajustado"); if (r) onSaved(); }}>
        <p className="muted">Stock actual: <b style={{ color: "var(--text)" }}>{p.stock}</b></p>
        <div className="seg"><button type="button" className={`pill ${dir === 1 ? "on" : ""}`} onClick={() => setDir(1)}>Entrada (+)</button><button type="button" className={`pill ${dir === -1 ? "on" : ""}`} onClick={() => setDir(-1)}>Salida (−)</button></div>
        <Field label="Cantidad"><input type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <Field label="Motivo"><input required placeholder={dir === 1 ? "Compra a proveedor" : "Merma, uso interno…"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Actions onCancel={onClose} busy={busy} disabled={!reason || Number(n) < 1} />
      </form>
    </Modal>
  );
}

function ProductForm({ p, onClose, onSaved }: { p: P | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: p?.name ?? "", price: p ? pesos(p.price) : "", cost: p?.cost !== undefined ? pesos(p.cost) : "", stock: "0", lowStockAlert: String(p?.lowStockAlert ?? 3) });
  const { run, busy } = useAction();
  const margin = toCents(f.price) - toCents(f.cost);
  return (
    <Modal title={p ? "Editar producto" : "Nuevo producto"} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { name: f.name, price: toCents(f.price), cost: toCents(f.cost), lowStockAlert: Number(f.lowStockAlert) };
        if (!p) body.stock = Number(f.stock);
        const r = await run(() => p ? api(`/api/products/${p.id}`, { method: "PATCH", body }) : api("/api/products", { body }), "Producto guardado");
        if (r) onSaved();
      }}>
        <Field label="Nombre"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Precio de venta"><input required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Costo"><input required inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          {!p && <Field label="Stock inicial"><input type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field>}
          <Field label="Alerta de stock bajo"><input type="number" min={0} value={f.lowStockAlert} onChange={(e) => setF({ ...f, lowStockAlert: e.target.value })} /></Field>
        </div>
        <p className="small">Margen: <b className={margin >= 0 ? "ok" : "bad"}>{money(margin)}</b>{p && <span className="muted"> · El stock se cambia con “Ajustar stock” para que quede el motivo.</span>}</p>
        <Actions onCancel={onClose} busy={busy} />
        {p && <button type="button" className="btn danger block" onClick={async () => { if (!confirm("¿Eliminar producto? Si tiene ventas se desactiva.")) return; const r = await run(() => api(`/api/products/${p.id}`, { method: "DELETE" }), "Producto eliminado/desactivado"); if (r) onSaved(); }}>Eliminar producto</button>}
      </form>
    </Modal>
  );
}

type E = { id: string; concept: string; category: string; amount: number; date: string };
function Expenses({ me }: { me: Me }) {
  const { data, error, reload } = useLoad<{ expenses: E[] }>("/api/expenses");
  const [edit, setEdit] = useState<E | "new" | null>(null);
  return (
    <div>
      <button className="btn gold block mb" onClick={() => setEdit("new")}>+ Nuevo gasto</button>
      {!data ? <Loading error={error} /> : !data.expenses.length ? <Empty title="Sin gastos registrados">Registra renta, insumos o sueldos para ver tu neto real.</Empty> : (
        <div className="card"><div className="lines">
          {data.expenses.map((e) => (
            <div key={e.id} style={{ alignItems: "center" }}>
              <div className="grow"><b className="wrap">{e.concept}</b><div className="small muted">{CATS[e.category]} · {dayLabel(e.date)}</div></div>
              <span className="n bad">{money(e.amount)}</span>
              <button className="btn sm" onClick={() => setEdit(e)}>Editar</button>
            </div>
          ))}
        </div></div>
      )}
      {edit && <ExpenseForm me={me} e={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function ExpenseForm({ me, e, onClose, onSaved }: { me: Me; e: E | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ concept: e?.concept ?? "", category: e?.category ?? "INSUMOS", amount: e ? pesos(e.amount) : "", date: e?.date ?? me.shop.today });
  const { run, busy } = useAction();
  return (
    <Modal title={e ? "Editar gasto" : "Nuevo gasto"} onClose={onClose}>
      <form className="stack" onSubmit={async (ev) => {
        ev.preventDefault();
        const body = { ...f, amount: toCents(f.amount) };
        const r = await run(() => e ? api(`/api/expenses/${e.id}`, { method: "PATCH", body }) : api("/api/expenses", { body }), "Gasto guardado");
        if (r) onSaved();
      }}>
        <Field label="Concepto"><input required value={f.concept} onChange={(x) => setF({ ...f, concept: x.target.value })} placeholder="Ej. Navajas desechables" /></Field>
        <Field label="Categoría"><select value={f.category} onChange={(x) => setF({ ...f, category: x.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="grid2">
          <Field label="Monto (MXN)"><input required inputMode="decimal" value={f.amount} onChange={(x) => setF({ ...f, amount: x.target.value })} /></Field>
          <Field label="Fecha"><input type="date" value={f.date} onChange={(x) => setF({ ...f, date: x.target.value })} /></Field>
        </div>
        <Actions onCancel={onClose} busy={busy} />
        {e && <button type="button" className="btn danger block" onClick={async () => { if (!confirm("¿Eliminar este gasto?")) return; const r = await run(() => api(`/api/expenses/${e.id}`, { method: "DELETE" }), "Gasto eliminado"); if (r) onSaved(); }}>Eliminar gasto</button>}
      </form>
    </Modal>
  );
}
