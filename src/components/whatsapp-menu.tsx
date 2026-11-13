"use client";
import { useRef } from "react";
import { logMessage } from "@/app/(panel)/clientes/actions";

/** Menú "WhatsApp" con mensajes listos. Al elegir uno abre wa.me y lo anota en la bitácora del cliente. */
export function WhatsAppMenu({ customerId, messages, chatUrl, disabled, className = "btn-quiet" }: {
  customerId: string;
  messages: { label: string; text: string; url: string }[];
  chatUrl: string;
  disabled?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative">
      <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>WhatsApp</summary>
      <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-ink-2 p-2">
        <a href={chatUrl} target="_blank" rel="noopener" className="block rounded-md px-3 py-2 text-sm hover:bg-ink-3"
          onClick={() => { if (ref.current) ref.current.open = false; }}>
          Abrir chat
        </a>
        {disabled ? (
          <p className="px-3 py-2 text-xs text-ash-2">{disabled}</p>
        ) : (
          messages.map((m) => (
            <a key={m.label} href={m.url} target="_blank" rel="noopener"
              className="block rounded-md px-3 py-2 hover:bg-ink-3"
              onClick={() => { void logMessage(customerId, m.text); if (ref.current) ref.current.open = false; }}>
              <span className="block text-sm">{m.label}</span>
              <span className="line-clamp-2 block text-xs text-ash">{m.text}</span>
            </a>
          ))
        )}
      </div>
    </details>
  );
}

/** Enlace directo a WhatsApp con un mensaje; lo anota en la bitácora al abrirlo. */
export function WhatsAppLink({ customerId, url, text, children = "WhatsApp", className = "btn-ghost text-sm" }: {
  customerId: string; url: string; text: string; children?: React.ReactNode; className?: string;
}) {
  return (
    <a href={url} target="_blank" rel="noopener" className={className} onClick={() => void logMessage(customerId, text)}>
      {children}
    </a>
  );
}
