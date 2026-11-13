import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { dateTimeLabel } from "@/lib/time";
import { money } from "@/lib/format";
import { Field, PageHeader, SectionTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ProductFields } from "@/components/product-fields";
import { moveStock, toggleProduct, updateProduct } from "../actions";

export const metadata = { title: "Producto" };
const MOVE = { PURCHASE: "Entrada", SALE: "Venta", ADJUSTMENT: "Ajuste", INTERNAL_USE: "Uso interno" } as const;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { shop } = await requireSection("productos");
  const p = await prisma.product.findFirst({
    where: { id, shopId: shop.id },
    include: { moves: { orderBy: { createdAt: "desc" }, take: 25, include: { sale: true } } },
  });
  if (!p) notFound();
  const categories = (await prisma.product.findMany({ where: { shopId: shop.id, category: { not: null } }, distinct: ["category"], select: { category: true } }))
    .map((c) => c.category!) ;

  return (
    <>
      <PageHeader
        back={{ href: "/productos", label: "Productos" }}
        title={p.name}
        subtitle={<>{p.brand && `${p.brand}. `}<span className="tnum">{p.stock}</span> en existencia, se vende a <span className="tnum">{money(p.price)}</span></>}
        actions={
          <form action={toggleProduct}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn-ghost text-sm">{p.active ? "Archivar" : "Volver a vender"}</button>
          </form>
        }
      />

      <div className="grid gap-14 lg:grid-cols-[1fr_340px]">
        <section>
          <SectionTitle>Datos</SectionTitle>
          <ActionForm action={updateProduct}>
            <input type="hidden" name="id" value={p.id} />
            <ProductFields categories={categories}
              p={{ ...p, price: p.price.toString(), cost: p.cost?.toString() ?? null }} />
            <div className="mt-6"><Submit>Guardar cambios</Submit></div>
          </ActionForm>
        </section>

        <aside className="space-y-12">
          <section>
            <SectionTitle>Mover inventario</SectionTitle>
            <ActionForm action={moveStock} resetOnOk className="space-y-4">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Movimiento">
                <select name="type" className="field" defaultValue="PURCHASE">
                  <option value="PURCHASE">Entrada de mercancía</option>
                  <option value="INTERNAL_USE">Uso en servicios</option>
                  <option value="COUNT">Conteo físico (existencia real)</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cantidad"><input name="quantity" inputMode="numeric" required className="field tnum" /></Field>
                <Field label="Costo unitario"><input name="unitCost" inputMode="decimal" className="field tnum" placeholder="Solo entradas" /></Field>
              </div>
              <Field label="Nota"><input name="note" className="field" placeholder="Proveedor, motivo…" /></Field>
              <Submit className="btn-quiet">Registrar</Submit>
            </ActionForm>
          </section>

          <section>
            <SectionTitle>Movimientos</SectionTitle>
            {p.moves.length === 0 ? (
              <p className="text-sm text-ash">Sin movimientos todavía.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {p.moves.map((m) => (
                  <li key={m.id} className="flex justify-between gap-4">
                    <span>
                      {MOVE[m.type]}{m.sale && ` #${m.sale.folio}`}
                      <span className="block text-xs text-ash">{dateTimeLabel(m.createdAt, shop.timezone)}{m.note && `. ${m.note}`}</span>
                    </span>
                    <span className="text-right tnum">
                      <span className={m.quantity < 0 ? "text-ash" : "text-foam"}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
                      <span className="block text-xs text-ash-2">quedan {m.stockAfter}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
