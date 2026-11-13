import { Scissors } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { createShop } from "./actions";
import { SERVICE_TEMPLATES } from "@/lib/templates";

export const metadata = { title: "Tu barbería" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const user = await requireUser();
  // Quien ya está en un equipo (por ejemplo, un barbero invitado) no tiene que crear barbería
  const { nueva } = await searchParams;
  if (!nueva && (await prisma.staff.count({ where: { userId: user.id, active: true } })) > 0) redirect("/hoy");
  return (
    <main className="card mx-4 my-10 p-6 sm:mx-auto sm:max-w-2xl sm:p-10">
      <span className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-5" /></span><span className="font-display text-lg">BarberOS</span></span>
      <h1 className="mt-8 font-display text-3xl leading-tight">Hola, {user.name.split(" ")[0]}. Registra tu barbería.</h1>
      <p className="mt-3 text-muted">Podrás cambiar todo después en Ajustes. Empezamos con horario de lunes a sábado, de 10:00 a 20:00.</p>

      <ActionForm action={createShop} className="mt-8 space-y-5">
        <Field label="Nombre de la barbería"><input name="name" required className="field" placeholder="Barbería La Navaja" /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Teléfono"><input name="phone" inputMode="tel" className="field" /></Field>
          <Field label="Ciudad o dirección"><input name="address" className="field" /></Field>
        </div>
        <fieldset className="space-y-3 pt-2">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="works" defaultChecked className="mt-1 accent-[var(--color-brand)]" />
            <span>También atiendo clientes<span className="block text-sm text-muted">Te agregamos como barbero en la agenda.</span></span>
          </label>
        </fieldset>
        <fieldset className="pt-2">
          <legend className="font-medium">¿Qué servicios ofreces?</legend>
          <p className="mb-3 text-sm text-muted">Marca los que haces. Los precios son de referencia; cámbialos después en Servicios.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SERVICE_TEMPLATES.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <span className="flex items-center gap-2.5">
                  <input type="checkbox" name="tpl" value={t.key} defaultChecked={t.on} className="size-4 accent-[var(--color-brand)]" />
                  <span className="text-sm">{t.name}<span className="block text-xs text-muted">{t.minutes} min</span></span>
                </span>
                <span className="text-sm text-muted tnum">${t.price}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="pt-4"><Submit pending="Creando…">Crear barbería</Submit></div>
      </ActionForm>
    </main>
  );
}
