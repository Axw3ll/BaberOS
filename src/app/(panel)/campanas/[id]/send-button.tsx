"use client";
import { useOptimistic, useTransition } from "react";
import { markSent } from "../actions";

/** Abre WhatsApp con el mensaje y marca al destinatario como enviado. */
export function SendButton({ recipientId, url, sent }: { recipientId: string; url: string; sent: boolean }) {
  const [done, setDone] = useOptimistic(sent);
  const [, start] = useTransition();
  return (
    <a href={url} target="_blank" rel="noopener"
      onClick={() => { if (!done) start(async () => { setDone(true); await markSent(recipientId); }); }}
      className={done ? "btn-ghost text-sm" : "btn border border-success/25 bg-success/10 py-1.5 text-success hover:bg-success/15"}>
      {done ? "Enviado · reenviar" : "Enviar por WhatsApp"}
    </a>
  );
}
