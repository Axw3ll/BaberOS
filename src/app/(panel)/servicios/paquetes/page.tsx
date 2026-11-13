import { Infinity as InfinityIcon, Ticket } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { money } from "@/lib/format";
import { Empty, Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { savePackage, togglePackage } from "./actions";

export const metadata = { title: "Paquetes y membresías" };

export default async function PaquetesPage() {
  const { shop } = await requireSection("servicios");
  const [packages, services, sold] = await Promise.all([
    prisma.package.findMany({ where: { shopId: shop.id }, include: { services: true }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
    prisma.service.findMany({ where: { shopId: shop.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.customerPackage.groupBy({ by: ["packageId"], where: { shopId: shop.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, _count: true }),
  ]);
  const activeCount = new Map(sold.map((s) => [s.packageId, s._count]));
  const svcName = new Map(services.map((s) => [s.id, s.name]));

  const form = (p?: (typeof packages)[number]) => (
    <ActionForm action={savePackage} resetOnOk={!p} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre"><input name="name" defaultValue={p?.name} required maxLength={60} placeholder="5 cortes" className="field" /></Field>
        <Field label="Tipo">
          <select name="kind" defaultValue={p?.kind ?? "BUNDLE"} className="field">
            <option value="BUNDLE">Paquete (número de servicios)</option>
            <option value="MEMBERSHIP">Membresía (ilimitado por días)</option>
          </select>
        </Field>
        <Field label="Precio"><input name="price" defaultValue={p ? Number(p.price) : ""} inputMode="decimal" required className="field tnum" /></Field>
        <Field label="Servicios incluidos" hint="Solo si es paquete"><input name="uses" defaultValue={p?.uses ?? ""} inputMode="numeric" placeholder="5" className="field tnum" /></Field>
        <Field label="Vigencia (días)" hint="Desde que lo compra"><input name="days" defaultValue={p?.days ?? 90} inputMode="numeric" required className="field tnum" /></Field>
      </div>
      <fieldset>
        <legend className="label">Cubre estos servicios</legend>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="checkbox" name="serviceId" value={s.id} defaultChecked={p ? p.services.some((x) => x.serviceId === s.id) : false} className="size-3.5 accent-[var(--color-brand)]" />
              {s.name} <span className="text-muted">{money(s.price, true)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Submit className={p ? "btn-quiet" : "btn-primary"}>{p ? "Guardar" : "Crear"}</Submit>
    </ActionForm>
  );

  return (
    <>
      <PageHeader back={{ href: "/servicios", label: "Servicios" }} title="Paquetes y membresías"
        subtitle="Se venden en la caja y se descuentan solos en las siguientes visitas del cliente." />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {packages.length === 0 ? (
            <Empty title="Aún no tienes paquetes">Por ejemplo: “5 cortes por $800” o “Corte ilimitado al mes por $599”. Dinero por adelantado y clientes que regresan.</Empty>
          ) : packages.map((p) => {
            const value = p.kind === "BUNDLE" && p.uses ? p.services.reduce((m, s) => Math.max(m, Number(services.find((x) => x.id === s.serviceId)?.price ?? 0)), 0) * p.uses : null;
            return (
              <section key={p.id} className={p.active ? "" : "opacity-60"}>
                <div className="section-title mb-4 flex items-center justify-between gap-4">
                  <h2 className="flex items-center gap-2 font-display text-lg">{p.kind === "BUNDLE" ? <Ticket className="size-5 text-brand" /> : <InfinityIcon className="size-5 text-brand" />}{p.name}</h2>
                  <form action={togglePackage}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost text-sm">{p.active ? "Pausar venta" : "Reactivar"}</button></form>
                </div>
                <p className="mb-4 text-sm text-muted">
                  {money(p.price)} · {p.kind === "BUNDLE" ? `${p.uses} servicios` : "ilimitado"} · vigencia {p.days} días · cubre {p.services.map((s) => svcName.get(s.serviceId)).filter(Boolean).join(", ")}
                  {value && value > Number(p.price) && <> · el cliente ahorra {money(value - Number(p.price), true)}</>}
                  {" · "}<strong className="text-fg">{activeCount.get(p.id) ?? 0} vigentes</strong>
                </p>
                <details><summary className="cursor-pointer text-sm font-medium text-brand">Editar</summary><div className="mt-3">{form(p)}</div></details>
              </section>
            );
          })}
        </div>
        <aside><section><SectionTitle>Nuevo paquete</SectionTitle>{form()}</section></aside>
      </div>
    </>
  );
}
