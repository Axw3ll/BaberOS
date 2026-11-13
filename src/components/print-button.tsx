"use client";
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="btn-quiet">Imprimir ticket</button>;
}
