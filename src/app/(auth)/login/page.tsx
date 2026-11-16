import Link from "next/link";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { signIn } from "../actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ enlace?: string }> }) {
  const { enlace } = await searchParams;
  return (
    <>
      <h1 className="font-display text-3xl">Entrar</h1>
      <p className="mt-2 text-muted">Con el email de tu cuenta.</p>
      {enlace === "vencido" && <p role="alert" className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Ese enlace ya venció o ya se usó. Pide uno nuevo.</p>}
      <ActionForm action={signIn} className="mt-10 space-y-5">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className="field" /></Field>
        <Field label="Contraseña"><input name="password" type="password" required autoComplete="current-password" className="field" /></Field>
        <p className="-mt-2 text-right text-sm"><Link href="/recuperar" className="link">¿Olvidaste tu contraseña?</Link></p>
        <Submit pending="Entrando…" className="btn-primary w-full">Entrar</Submit>
      </ActionForm>
      <p className="mt-8 text-sm text-muted">
        ¿Aún no tienes cuenta? <Link href="/registro" className="link">Crea una</Link>
      </p>
    </>
  );
}
