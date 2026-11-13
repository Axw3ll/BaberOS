"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [slug, setSlug] = useState("");
  const r = useRouter();
  return (
    <main className="lock">
      <div className="wordmark" style={{ fontSize: 64 }}>BARBER<span>OS</span></div>
      <p className="muted" style={{ textAlign: "center", maxWidth: 360 }}>Agenda, cobros, caja y lealtad para tu barbería. Hecho para usarse en el celular dentro del local.</p>
      <div className="panel stack" style={{ width: "100%", maxWidth: 420 }}>
        <a className="btn gold block" href="/setup">Crear mi barbería · 14 días gratis</a>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (slug.trim()) r.push(`/${slug.trim().toLowerCase()}`); }}>
          <label className="f"><span>¿Ya tienes cuenta? Escribe el identificador de tu barbería</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ej. barberia-el-patron" autoCapitalize="none" />
          </label>
          <button className="btn block">Abrir mi barbería</button>
        </form>
        <a className="btn block" href="/demo">Ver la barbería demo (datos de ejemplo)</a>
      </div>
    </main>
  );
}
