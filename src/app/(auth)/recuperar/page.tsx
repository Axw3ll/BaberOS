import Link from "next/link";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { requestReset } from "../actions";

export const metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="font-display text-3xl">Recuperar contraseña</h1>
      <p className="mt-2 text-muted">Te mandamos un enlace a tu correo para elegir una nueva.</p>
      <ActionForm action={requestReset} className="mt-10 space-y-5">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className="field" /></Field>
        <Submit pending="Enviando…" className="btn-primary w-full">Enviar enlace</Submit>
      </ActionForm>
      <p className="mt-8 text-sm text-muted"><Link href="/login" className="link">Regresar a entrar</Link></p>
    </>
  );
}
