import { Field } from "./ui";

type P = { name?: string; brand?: string | null; category?: string | null; sku?: string | null; price?: string; cost?: string | null; minStock?: number };

export function ProductFields({ p = {}, categories, withStock = false }: { p?: P; categories: string[]; withStock?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Nombre" className="sm:col-span-2"><input name="name" defaultValue={p.name} required className="field" placeholder="Cera mate 100 g" /></Field>
      <Field label="Marca"><input name="brand" defaultValue={p.brand ?? ""} className="field" /></Field>
      <Field label="Categoría">
        <input name="category" list="categorias" defaultValue={p.category ?? ""} className="field" placeholder="Ceras, Geles, Aceites…" />
        <datalist id="categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Precio de venta"><input name="price" inputMode="decimal" defaultValue={p.price} required className="field tnum" /></Field>
      <Field label="Costo" hint="Lo que te cuesta. Sirve para ver tu margen."><input name="cost" inputMode="decimal" defaultValue={p.cost ?? ""} className="field tnum" /></Field>
      <Field label="Código o SKU"><input name="sku" defaultValue={p.sku ?? ""} className="field" /></Field>
      <Field label="Avisar cuando queden" hint="Aparece en Hoy como producto por surtir."><input name="minStock" inputMode="numeric" defaultValue={p.minStock ?? 3} className="field tnum" /></Field>
      {withStock && <Field label="Existencia inicial"><input name="stock" inputMode="numeric" defaultValue={0} className="field tnum" /></Field>}
    </div>
  );
}
