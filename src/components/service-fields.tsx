import { Field } from "./ui";

export function ServiceFields({ s, staff, assigned }: {
  s?: { name: string; minutes: number; price: string; description: string | null; bookableOnline: boolean };
  staff: { id: string; name: string }[]; assigned: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-[1fr_140px_140px]">
        <Field label="Nombre"><input name="name" defaultValue={s?.name} required className="field" placeholder="Corte degradado" /></Field>
        <Field label="Duración (min)"><input name="minutes" inputMode="numeric" defaultValue={s?.minutes ?? 40} required className="field tnum" /></Field>
        <Field label="Precio"><input name="price" inputMode="decimal" defaultValue={s?.price} required className="field tnum" /></Field>
      </div>
      <Field label="Descripción" hint="Se muestra en la página de reservas.">
        <input name="description" defaultValue={s?.description ?? ""} className="field" />
      </Field>
      <fieldset>
        <legend className="label">Lo hacen</legend>
        {staff.length === 0 ? <p className="text-sm text-muted">Aún no hay barberos en Equipo.</p> : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {staff.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" name="staffId" value={p.id} defaultChecked={assigned.includes(p.id)} className="accent-[var(--color-brand)]" />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="bookableOnline" defaultChecked={s?.bookableOnline ?? true} className="accent-[var(--color-brand)]" />
        Se puede reservar en línea
      </label>
    </div>
  );
}
