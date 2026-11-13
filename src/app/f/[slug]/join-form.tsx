"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { joinOnline } from "./actions";

function Go() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="btn-primary w-full py-3">{pending ? "Formándote…" : "Formarme en la fila"}</button>;
}

export function JoinForm({ slug, services, staff }: { slug: string; services: { id: string; name: string }[]; staff: { id: string; name: string }[] }) {
  const [state, run] = useActionState(joinOnline, undefined);
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
      <label className="block"><span className="label">Tu nombre</span><input name="name" required maxLength={60} autoComplete="name" className="field" /></label>
      <label className="block"><span className="label">Tu WhatsApp</span><input name="phone" required inputMode="tel" autoComplete="tel" placeholder="10 dígitos" className="field tnum" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Servicio</span>
          <select name="serviceId" className="field" defaultValue=""><option value="">Lo veo allá</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="block"><span className="label">Barbero</span>
          <select name="staffId" className="field" defaultValue=""><option value="">El que se desocupe</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <Go />
      <p className="text-center text-xs text-faint">Te avisamos por WhatsApp cuando ya casi te toque. <Link href="/privacidad" className="underline">Aviso de privacidad</Link></p>
    </form>
  );
}
