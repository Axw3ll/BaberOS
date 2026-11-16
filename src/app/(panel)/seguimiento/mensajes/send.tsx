"use client";
import { useOptimistic, useTransition } from "react";
import { Check, MessageCircle } from "lucide-react";
import { markMessageSent } from "./actions";

export function SendMessage({ id, url }: { id: string; url: string }) {
  const [done, setDone] = useOptimistic(false);
  const [, start] = useTransition();
  return done ? (
    <span className="btn-ghost text-success"><Check className="size-4" />Enviado</span>
  ) : (
    <a href={url} target="_blank" rel="noopener" onClick={() => start(async () => { setDone(true); await markMessageSent(id); })}
      className="btn border border-success/25 bg-success/10 py-1.5 text-success hover:bg-success/15">
      <MessageCircle className="size-4" aria-hidden />Enviar
    </a>
  );
}
