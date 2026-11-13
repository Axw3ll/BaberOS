import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { createShop } from "./actions";

export const metadata = { title: "Tu barbería" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const user = await requireUser();
  // Quien ya está en un equipo (por ejemplo, un barbero invitado) no tiene que crear barbería
  const { nueva } = await searchParams;
  if (!nueva && (await prisma.staff.count({ where: { userId: user.id, active: true } })) > 0) redirect("/hoy");
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <span className="font-display text-lg text-muted">BarberOS</span>
      <h1 className="mt-10 font-display text-4xl leading-tight">Hola, {user.name.split(" ")[0]}. Registra tu barbería.</h1>
      <p className="mt-3 text-muted">Podrás cambiar todo después en Ajustes. Empezamos con horario de lunes a sábado, de 10:00 a 20:00.</p>

      <ActionForm action={createShop} className="mt-12 space-y-5">
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
          <label className="flex items-start gap-3">
            <input type="checkbox" name="starter" defaultChecked className="mt-1 accent-[var(--color-brand)]" />
            <span>Crear servicios básicos<span className="block text-sm text-muted">Corte, barba, y corte con barba. Ajusta precios después.</span></span>
          </label>
        </fieldset>
        <div className="pt-4"><Submit pending="Creando…">Crear barbería</Submit></div>
      </ActionForm>
    </main>
  );
}
