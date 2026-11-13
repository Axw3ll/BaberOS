import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canAccess, requireSection } from "@/lib/auth";
import { dateLabel, toLocalDate } from "@/lib/time";
import { money } from "@/lib/format";
import { customerStats, inSegment, ORIGIN, SEGMENTS, STAGE, tagColor } from "@/lib/crm";
import { Chip, Dot, Empty, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { createCustomer } from "./actions";

export const metadata = { title: "Clientes" };

const SORTS = { reciente: "Última visita", gasto: "Lo que ha gastado", visitas: "Visitas", nombre: "Nombre", alta: "Más nuevos" } as const;
type Sort = keyof typeof SORTS;

export default async function ClientesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; nuevo?: string; seg?: string; sort?: string }>;
}) {
  const { shop, me } = await requireSection("clientes");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();
  const seg = sp.seg ?? "todos";
  const sort: Sort = sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : "reciente";
  const seesMoney = canAccess(me.role, "ventas") && me.role !== "BARBER";
  const tz = shop.timezone;

  const [all, tags, staff] = await Promise.all([
    customerStats(shop.id, { lostAfterDays: shop.lostAfterDays }),
    prisma.tag.findMany({ where: { shopId: shop.id }, orderBy: { name: "asc" } }),
    sp.nuevo ? prisma.staff.findMany({ where: { shopId: shop.id, active: true, takesAppointments: true }, orderBy: { name: "asc" } }) : [],
  ]);

  const digits = term.replace(/\D/g, "");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matches = all.filter((c) =>
    !term || norm(c.name).includes(norm(term)) || (digits.length >= 3 && c.phone.includes(digits)) || (c.email ?? "").toLowerCase().includes(term.toLowerCase()));
  const count = (s: string) => matches.filter((c) => inSegment(c, s, tz)).length;
  const list = matches.filter((c) => inSegment(c, seg, tz));

  const t = (d: Date | null) => d?.getTime() ?? 0;
  list.sort((a, b) =>
    sort === "nombre" ? a.name.localeCompare(b.name, "es")
    : sort === "gasto" ? b.spent - a.spent
    : sort === "visitas" ? b.visits - a.visits
    : sort === "alta" ? t(b.createdAt) - t(a.createdAt)
    : t(b.lastVisit) - t(a.lastVisit) || a.name.localeCompare(b.name, "es"));
  const shown = list.slice(0, 150);
  const tagById = new Map(tags.map((x) => [x.id, x]));

  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { q: term || undefined, seg: seg === "todos" ? undefined : seg, sort: sort === "reciente" ? undefined : sort, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/clientes?${s}` : "/clientes";
  };
  const exportHref = `/clientes/exportar?${new URLSearchParams({ seg, q: term }).toString()}`;

  return (
    <>
      <PageHeader title="Clientes" subtitle={`${all.length} ${all.length === 1 ? "cliente registrado" : "clientes registrados"}`}
        actions={
          <>
            {canAccess(me.role, "campanas") && !term && list.length > 0 && seg !== "todos" && (
              <Link href={`/campanas/nueva?seg=${encodeURIComponent(seg)}`} className="btn-quiet">Mandar mensaje a {list.length}</Link>
            )}
            {me.role !== "BARBER" && <Link href="/clientes/importar" className="btn-ghost">Importar</Link>}
            {me.role !== "BARBER" && <a href={exportHref} className="btn-ghost">Exportar CSV</a>}
            <Link href={href({ nuevo: "1" })} className="btn-primary">Agregar cliente</Link>
          </>
        } />

      {sp.nuevo && (
        <section className="mb-8 rounded-lg border border-line p-6 sm:p-8">
          <h2 className="mb-6 font-display text-xl">Nuevo cliente</h2>
          <ActionForm action={createCustomer}>
            <input type="hidden" name="marketingShown" value="1" />
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Nombre"><input name="name" required className="field" /></Field>
              <Field label="Teléfono"><input name="phone" inputMode="tel" required className="field" /></Field>
              <Field label="Email"><input name="email" type="email" className="field" /></Field>
              <Field label="Cumpleaños" hint="Si no sabe el año, pon cualquiera"><input name="birthday" type="date" className="field" /></Field>
              <Field label="¿Cómo nos conoció?">
                <select name="origin" className="field" defaultValue="">
                  <option value="">Sin dato</option>
                  {Object.entries(ORIGIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Barbero de confianza">
                <select name="preferredStaffId" className="field" defaultValue="">
                  <option value="">El que esté libre</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Lo recomendó (teléfono)" hint="Otro cliente de la barbería"><input name="referredByPhone" inputMode="tel" className="field" /></Field>
              <Field label="Nota" className="sm:col-span-2"><input name="notes" className="field" placeholder="Cómo le gusta el corte" /></Field>
            </div>
            <label className="mt-5 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="acceptsMarketing" defaultChecked className="size-4 accent-[var(--color-brand)]" />
              Acepta recibir promociones por WhatsApp
            </label>
            <div className="mt-6 flex gap-2"><Submit>Guardar cliente</Submit><Link href={href({})} className="btn-ghost">Cancelar</Link></div>
          </ActionForm>
        </section>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <form className="w-full max-w-sm">
          {seg !== "todos" && <input type="hidden" name="seg" value={seg} />}
          {sort !== "reciente" && <input type="hidden" name="sort" value={sort} />}
          <input name="q" defaultValue={term} placeholder="Buscar por nombre, teléfono o email" aria-label="Buscar cliente" className="field" />
        </form>
        <nav aria-label="Ordenar" className="flex items-center gap-2 text-sm text-muted">
          Ordenar por
          {(Object.keys(SORTS) as Sort[]).filter((k) => seesMoney || k !== "gasto").map((k) => (
            <Link key={k} href={href({ sort: k === "reciente" ? undefined : k })}
              className={k === sort ? "text-fg" : "hover:text-fg"} aria-current={k === sort ? "true" : undefined}>
              {SORTS[k]}
            </Link>
          ))}
        </nav>
      </div>

      <nav aria-label="Segmentos" className="mb-8 flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <Chip key={s.id} href={href({ seg: s.id === "todos" ? undefined : s.id })} active={seg === s.id}
            color={s.id in STAGE ? STAGE[s.id as keyof typeof STAGE].color : undefined}>
            {s.label} <span className="tnum text-faint">{count(s.id)}</span>
          </Chip>
        ))}
        {tags.map((tg) => (
          <Chip key={tg.id} href={href({ seg: `tag:${tg.id}` })} active={seg === `tag:${tg.id}`} color={tagColor(tg.color)}>
            {tg.name} <span className="tnum text-faint">{count(`tag:${tg.id}`)}</span>
          </Chip>
        ))}
      </nav>

      {list.length === 0 ? (
        <Empty title={term ? "Nadie con esos datos" : all.length ? "Nadie en este segmento" : "Aún no hay clientes"}>
          {term ? "Revisa el nombre o prueba con el teléfono." : all.length ? "Prueba con otro filtro." : "Se registran solos al agendar o cobrar con teléfono."}
        </Empty>
      ) : (
        <div className="table-card">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-sm text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Cliente</th>
                <th className="py-2 pr-4 font-normal">Etapa</th>
                <th className="py-2 pr-4 text-right font-normal">Visitas</th>
                <th className="py-2 pr-4 font-normal">Última visita</th>
                {seesMoney && <th className="py-2 pr-4 text-right font-normal">Gastado</th>}
                <th className="py-2 font-normal">Etiquetas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {shown.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-hover">
                  <td className="py-3 pr-4">
                    <Link href={`/clientes/${c.id}`} className="block hover:text-fg">
                      {c.name}{c.vip && <span className="ml-2 text-xs text-warning">VIP</span>}
                      <span className="block text-sm text-muted tnum">{c.phone}</span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4"><Dot color={STAGE[c.stage].color}>{STAGE[c.stage].label}</Dot></td>
                  <td className="py-3 pr-4 text-right tnum">{c.visits}</td>
                  <td className="py-3 pr-4 text-sm text-muted">
                    {c.lastVisit ? (
                      <>
                        {dateLabel(toLocalDate(c.lastVisit, tz), { day: "numeric", month: "short", year: "2-digit" })}
                        <span className="block text-faint">{c.daysSince === 0 ? "hoy" : `hace ${c.daysSince} ${c.daysSince === 1 ? "día" : "días"}`}</span>
                      </>
                    ) : "—"}
                  </td>
                  {seesMoney && <td className="py-3 pr-4 text-right tnum">{money(c.spent, true)}</td>}
                  <td className="py-3">
                    <span className="flex flex-wrap gap-1">
                      {c.tagIds.map((id) => tagById.get(id)).filter(Boolean).map((tg) => (
                        <Chip key={tg!.id} color={tagColor(tg!.color)}>{tg!.name}</Chip>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > shown.length && (
            <p className="mt-4 text-sm text-muted">Mostrando {shown.length} de {list.length}. Usa la búsqueda o los filtros para encontrar a los demás.</p>
          )}
        </div>
      )}
    </>
  );
}
