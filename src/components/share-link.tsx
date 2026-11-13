"use client";
import { useRef, useState } from "react";
import { Check, Copy, Link2, MessageCircle } from "lucide-react";
import { whatsappUrlClient } from "./wa";
import { logMessage } from "@/app/(panel)/clientes/actions";

/** Botón "Su enlace": copia o manda por WhatsApp la página personal del cliente. */
export function ShareLink({ customerId, phone, url, shopName, name }: { customerId: string; phone: string; url: string; shopName: string; name: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  const text = `Hola ${name.split(/\s+/)[0]}, aquí puedes ver tu tarjeta de ${shopName}, tus citas y reservar cuando quieras: ${url}`;
  return (
    <details ref={ref} className="relative">
      <summary className="btn-quiet cursor-pointer list-none [&::-webkit-details-marker]:hidden"><Link2 className="size-4" />Su enlace</summary>
      <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line-soft bg-surface p-3 shadow-pop">
        <p className="text-sm text-muted">Su página personal: tarjeta, citas y reservar. No necesita cuenta.</p>
        <p className="mt-2 truncate rounded-lg bg-hover px-2 py-1.5 font-mono text-xs">{url}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-quiet" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sin permiso */ } }}>
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}{copied ? "Copiado" : "Copiar"}
          </button>
          <a href={whatsappUrlClient(phone, text)} target="_blank" rel="noopener" className="btn border border-success/25 bg-success/10 text-success hover:bg-success/15"
            onClick={() => { void logMessage(customerId, text); if (ref.current) ref.current.open = false; }}>
            <MessageCircle className="size-4" />Mandar
          </a>
        </div>
      </div>
    </details>
  );
}
