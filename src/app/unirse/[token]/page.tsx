import Link from "next/link";
import { Scissors } from "lucide-react";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { findInvite } from "@/lib/invite";
import { ROLE_LABEL } from "@/lib/auth";
import { acceptInvite } from "./actions";

export const metadata = { title: "Únete a tu equipo", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await findInvite(token);
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="card w-full max-w-sm p-7">
        <span className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-5" /></span>
          <span className="font-display text-xl">BarberOS</span>
        </span>
        {!s?.email ? (
          <>
            <h1 className="font-display text-2xl">Esta invitación ya no sirve</h1>
            <p className="mt-2 text-muted">Puede que ya hayas creado tu cuenta o que el dueño cambiara tu correo. Si ya tienes cuenta, entra con tu correo y contraseña; si no, pide un enlace nuevo.</p>
            <Link href="/login" className="btn-primary mt-6 w-full">Entrar</Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl">Únete a {s.shop.name}</h1>
            <p className="mt-1 text-muted">Te agregaron como {ROLE_LABEL[s.role].toLowerCase()}. Elige tu contraseña y entra directo a tu agenda.</p>
            <ActionForm action={acceptInvite} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="Tu correo"><input value={s.email} disabled className="field opacity-70" /></Field>
              <Field label="Tu nombre"><input name="name" defaultValue={s.name} required maxLength={80} autoComplete="name" className="field" /></Field>
              <Field label="Contraseña" hint="Mínimo 8 caracteres"><input name="password" type="password" minLength={8} maxLength={72} required autoComplete="new-password" className="field" /></Field>
              <label className="flex items-start gap-2 text-sm text-muted">
                <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />
                <span>Acepto los <Link href="/terminos" className="link" target="_blank">términos</Link> y el <Link href="/privacidad" className="link" target="_blank">aviso de privacidad</Link>.</span>
              </label>
              <Submit pending="Creando tu cuenta…" className="btn-primary w-full">Crear mi cuenta y entrar</Submit>
            </ActionForm>
            <p className="mt-6 text-sm text-muted">¿Ya tienes cuenta con este correo? <Link href="/login" className="link">Entra</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
