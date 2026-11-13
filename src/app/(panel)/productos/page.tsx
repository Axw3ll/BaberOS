import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";
import { money } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { ProductFields } from "@/components/product-fields";
import { createProduct } from "./actions";

export const metadata = { title: "Productos" };

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ nuevo?: string; ver?: string }> }) {
  const { shop } = await requireSection("productos");
  const sp = await searchParams;
  const showInactive = sp.ver === "todos";
  const products = await prisma.product.findMany({
    where: { shopId: shop.id, ...(!showInactive && { active: true }) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean) as string[])];
  const groups = new Map<string, typeof products>();
  for (const p of products) groups.set(p.category ?? "Sin categoría", [...(groups.get(p.category ?? "Sin categoría") ?? []), p]);
  const value = products.filter((p) => p.active).reduce((a, p) => a + Number(p.cost ?? 0) * p.stock, 0);

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle={products.length ? `${products.length} productos. Inventario a costo: ${money(value)}` : "Ceras, geles, pomadas y todo lo que vendes en mostrador."}
        actions={
          <>
            <Link href={showInactive ? "/productos" : "/productos?ver=todos"} className="btn-ghost text-sm">
              {showInactive ? "Ocultar archivados" : "Ver archivados"}
            </Link>
            <Link href="/productos?nuevo=1" className="btn-primary">Agregar producto</Link>
          </>
        }
      />

      {sp.nuevo && (
        <section className="mb-14 rounded-lg border border-line p-6 sm:p-8">
          <h2 className="mb-6 font-display text-xl">Nuevo producto</h2>
          <ActionForm action={createProduct}>
            <ProductFields categories={categories} withStock />
            <div className="mt-6 flex gap-2">
              <Submit>Guardar producto</Submit>
              <Link href="/productos" className="btn-ghost">Cancelar</Link>
            </div>
          </ActionForm>
        </section>
      )}

      {products.length === 0 && !sp.nuevo ? (
        <Empty title="Aún no hay productos" action={<Link href="/productos?nuevo=1" className="btn-quiet">Agregar el primero</Link>}>
          Registra lo que vendes para cobrarlo en el ticket y saber cuándo surtir.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed text-left">
            <colgroup><col /><col className="w-32" /><col className="w-28" /><col className="w-28" /></colgroup>
            <thead className="text-sm text-ash">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-normal">Producto</th>
                <th className="py-2 pr-4 text-right font-normal">Precio</th>
                <th className="py-2 pr-4 text-right font-normal">Margen</th>
                <th className="py-2 text-right font-normal">Existencia</th>
              </tr>
            </thead>
            {[...groups.entries()].map(([cat, list]) => (
              <tbody key={cat} className="divide-y divide-line-soft">
                <tr><th colSpan={4} className="pt-10 pb-2 text-left font-display text-xl font-normal text-foam">{cat}</th></tr>
                {list.map((p) => {
                  const margin = p.cost && Number(p.price) > 0 ? 1 - Number(p.cost) / Number(p.price) : null;
                  const low = p.stock <= p.minStock;
                  return (
                    <tr key={p.id} className={p.active ? "" : "text-ash-2"}>
                      <td className="truncate py-3 pr-4">
                        <Link href={`/productos/${p.id}`} className="decoration-line underline-offset-4 hover:underline">{p.name}</Link>
                        {p.brand && <span className="ml-2 text-sm text-ash">{p.brand}</span>}
                        {!p.active && <span className="ml-2 text-sm">Archivado</span>}
                      </td>
                      <td className="py-3 pr-4 text-right tnum">{money(p.price)}</td>
                      <td className="py-3 pr-4 text-right tnum text-ash">{margin === null ? "—" : `${Math.round(margin * 100)}%`}</td>
                      <td className={`py-3 text-right tnum ${p.stock === 0 ? "text-rose" : low ? "text-sand" : ""}`}>{p.stock === 0 ? "Agotado" : p.stock}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </>
  );
}
