import Link from "next/link";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { signUp } from "../actions";

export const metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-display text-3xl">Crear cuenta</h1>
      <p className="mt-2 text-ash">Si te invitaron a una barbería, usa el mismo email de la invitación.</p>
      <ActionForm action={signUp} className="mt-10 space-y-5">
        <Field label="Tu nombre"><input name="name" required autoComplete="name" className="field" /></Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className="field" /></Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres">
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="field" />
        </Field>
        <Submit pending="Creando cuenta…" className="btn-primary w-full">Crear cuenta</Submit>
      </ActionForm>
      <p className="mt-8 text-sm text-ash">
        ¿Ya tienes cuenta? <Link href="/login" className="link">Entra</Link>
      </p>
    </>
  );
}
