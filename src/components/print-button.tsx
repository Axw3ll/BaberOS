"use client";
export function PrintButton({ label = "Imprimir ticket" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-quiet">{label}</button>;
}
