import { Scissors } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { setPassword } from "./actions";

export const metadata = { title: "Tu contraseña" };

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="card w-full max-w-sm p-7">
        <span className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand"><Scissors className="size-5" /></span>
          <span className="font-display text-xl">BarberOS</span>
        </span>
        <h1 className="font-display text-2xl">Elige tu contraseña</h1>
        <p className="mt-1 text-muted">Para {user.email}. La usarás para entrar desde cualquier dispositivo.</p>
        <ActionForm action={setPassword} className="mt-6 space-y-4">
          <Field label="Tu nombre"><input name="name" defaultValue={user.name} required className="field" /></Field>
          <Field label="Contraseña nueva" hint="Mínimo 8 caracteres"><input name="password" type="password" minLength={8} required autoComplete="new-password" className="field" /></Field>
          <Submit pending="Guardando…" className="btn-primary w-full">Guardar y entrar</Submit>
        </ActionForm>
      </div>
    </main>
  );
}
