import Link from "next/link";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { signUp } from "../actions";

export const metadata = { title: "Crear cuenta" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <>
      <h1 className="font-display text-3xl">Crear cuenta</h1>
      <p className="mt-2 text-muted">
        {email ? "Te agregaron a un equipo. Crea tu cuenta con este correo y entrarás directo a tu agenda." : "Si te agregaron a una barbería, usa el mismo email que dio el dueño."}
      </p>
      <ActionForm action={signUp} className="mt-10 space-y-5">
        <Field label="Tu nombre"><input name="name" required autoComplete="name" className="field" /></Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="email" defaultValue={email ?? ""} className="field" /></Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="field" />
        </Field>
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />
          <span>Acepto los <Link href="/terminos" className="link" target="_blank">términos</Link> y el <Link href="/privacidad" className="link" target="_blank">aviso de privacidad</Link>.</span>
        </label>
        <Submit pending="Creando cuenta…" className="btn-primary w-full">Crear cuenta</Submit>
      </ActionForm>
      <p className="mt-8 text-sm text-muted">
        ¿Ya tienes cuenta? <Link href="/login" className="link">Entra</Link>
      </p>
    </>
  );
}
