"use client";
import { useOptimistic, useTransition } from "react";
import { setMarketing } from "./actions";

export function MarketingToggle({ token, accepts }: { token: string; accepts: boolean }) {
  const [on, setOn] = useOptimistic(accepts);
  const [, start] = useTransition();
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" checked={on} className="mt-0.5 size-4 accent-[var(--color-brand)]"
        onChange={(e) => { const v = e.target.checked; start(async () => { setOn(v); await setMarketing(token, v); }); }} />
      <span>
        Quiero recibir promociones y felicitaciones por WhatsApp
        <span className="block text-muted">Los avisos de tus citas te llegan aunque lo desactives.</span>
      </span>
    </label>
  );
}
