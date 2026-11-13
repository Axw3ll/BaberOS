"use client";
import { useRef } from "react";
import { MessageCircle } from "lucide-react";
import { logMessage } from "@/app/(panel)/clientes/actions";

/** Menú "WhatsApp" con mensajes listos. Al elegir uno abre wa.me y lo anota en la bitácora del cliente. */
const WA = "btn border border-success/25 bg-success/10 text-success hover:bg-success/15";

export function WhatsAppMenu({ customerId, messages, chatUrl, disabled, className = WA }: {
  customerId: string;
  messages: { label: string; text: string; url: string }[];
  chatUrl: string;
  disabled?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative">
      <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><MessageCircle className="size-4" aria-hidden />WhatsApp</summary>
      <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line-soft bg-surface p-2 shadow-pop">
        <a href={chatUrl} target="_blank" rel="noopener" className="block rounded-md px-3 py-2 text-sm hover:bg-hover"
          onClick={() => { if (ref.current) ref.current.open = false; }}>
          Abrir chat
        </a>
        {disabled ? (
          <p className="px-3 py-2 text-xs text-faint">{disabled}</p>
        ) : (
          messages.map((m) => (
            <a key={m.label} href={m.url} target="_blank" rel="noopener"
              className="block rounded-md px-3 py-2 hover:bg-hover"
              onClick={() => { void logMessage(customerId, m.text); if (ref.current) ref.current.open = false; }}>
              <span className="block text-sm">{m.label}</span>
              <span className="line-clamp-2 block text-xs text-muted">{m.text}</span>
            </a>
          ))
        )}
      </div>
    </details>
  );
}

/** Enlace directo a WhatsApp con un mensaje; lo anota en la bitácora al abrirlo. */
export function WhatsAppLink({ customerId, url, text, children = "WhatsApp", className = `${WA} py-1.5` }: {
  customerId: string; url: string; text: string; children?: React.ReactNode; className?: string;
}) {
  return (
    <a href={url} target="_blank" rel="noopener" className={className} onClick={() => void logMessage(customerId, text)}>
      <MessageCircle className="size-4" aria-hidden />{children}
    </a>
  );
}
