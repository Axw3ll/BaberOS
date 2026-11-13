"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import { importCustomers, type ImportResult, type ImportRow } from "./actions";

type Key = keyof ImportRow;
const FIELDS: { key: Key; label: string; required?: boolean; match: RegExp }[] = [
  { key: "name", label: "Nombre", required: true, match: /^(nombre( completo)?|name|cliente|full ?name)$/i },
  { key: "phone", label: "Teléfono", required: true, match: /(tel[eé]fono|celular|cel|whats|phone|m[oó]vil|movil|n[uú]mero)/i },
  { key: "email", label: "Correo", match: /(e-?mail|correo)/i },
  { key: "birthday", label: "Cumpleaños", match: /(cumple|nacimiento|birth|fecha de nac)/i },
  { key: "notes", label: "Notas", match: /(nota|comentario|observaci|notes)/i },
  { key: "tags", label: "Etiquetas", match: /(etiqueta|tags?|grupo|categor)/i },
];

/** CSV o lo copiado de Excel (tabuladores). Respeta comillas. */
function parse(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

export function Importer() {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<Key, number>>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function load(text: string) {
    const data = parse(text.replace(/^﻿/, ""));
    if (data.length < 2) { setRows(null); return; }
    setRows(data);
    setResult(null);
    const head = data[0];
    const m: Partial<Record<Key, number>> = {};
    for (const f of FIELDS) {
      const idx = head.findIndex((h, i) => f.match.test(h) && !Object.values(m).includes(i));
      if (idx >= 0) m[f.key] = idx;
    }
    setMap(m);
  }

  const body = rows?.slice(1) ?? [];
  const mapped: ImportRow[] = useMemo(() => body.map((r) => {
    const get = (k: Key) => (map[k] !== undefined ? r[map[k]!] ?? "" : "");
    return { name: get("name"), phone: get("phone"), email: get("email"), birthday: get("birthday"), notes: get("notes"), tags: get("tags") };
  }), [body, map]);
  const validPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 || (d.length === 12 && d.startsWith("52")) || (d.length === 13 && d.startsWith("521")); };
  const ok = mapped.filter((r) => r.name.trim() && validPhone(r.phone)).length;
  const ready = map.name !== undefined && map.phone !== undefined;

  if (result) {
    return (
      <div className="card p-6">
        <p className="flex items-center gap-2 text-lg font-semibold text-success"><CheckCircle2 className="size-5" />Importación terminada</p>
        <p className="mt-2">{result.created} clientes nuevos · {result.updated} ya existían (se completaron sus datos vacíos){result.skipped.length > 0 && ` · ${result.skipped.length} omitidos`}</p>
        {result.skipped.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted">Ver filas omitidas</summary>
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-muted">
              {result.skipped.map((s) => <li key={s.row}>Fila {s.row}: {s.reason}</li>)}
            </ul>
          </details>
        )}
        <div className="mt-6 flex gap-2"><Link href="/clientes" className="btn-primary">Ver clientes</Link><button onClick={() => { setRows(null); setResult(null); }} className="btn-quiet">Importar otro archivo</button></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="font-display text-lg">1. Tu lista</h2>
        <p className="mt-1 text-sm text-muted">Sube un archivo CSV (en Excel: Archivo → Guardar como → CSV) o copia las celdas en Excel o Google Sheets y pégalas aquí, con encabezados.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
          <label className="btn-quiet cursor-pointer">
            <FileUp className="size-4" />Subir CSV
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); }} />
          </label>
          <textarea rows={3} className="field font-mono text-xs" placeholder={"Nombre\tTeléfono\tCumpleaños\nJuan Pérez\t312 555 0101\t15/03/1990"}
            onChange={(e) => load(e.target.value)} aria-label="Pegar desde Excel" />
        </div>
      </section>

      {rows && (
        <>
          <section className="card p-6">
            <h2 className="font-display text-lg">2. Columnas</h2>
            <p className="mt-1 text-sm text-muted">Las detectamos solas; corrige si alguna no es.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f.key}>
                  <span className="label">{f.label}{f.required && " *"}</span>
                  <select className="field" value={map[f.key] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">— No importar —</option>
                    {rows[0].map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
              <h2 className="font-display text-lg">3. Vista previa</h2>
              <span className="text-sm text-muted">{body.length} filas · <span className="text-success">{ok} listas</span>{body.length - ok > 0 && <> · <span className="text-warning">{body.length - ok} con datos faltantes</span></>}</span>
            </div>
            <div className="overflow-x-auto px-6">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-muted"><tr className="border-b border-line">{FIELDS.filter((f) => map[f.key] !== undefined).map((f) => <th key={f.key} className="py-2 pr-4 font-normal">{f.label}</th>)}<th /></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {mapped.slice(0, 8).map((r, i) => {
                    const bad = !r.name.trim() || !validPhone(r.phone);
                    return (
                      <tr key={i} className={bad ? "text-warning" : ""}>
                        {FIELDS.filter((f) => map[f.key] !== undefined).map((f) => <td key={f.key} className="max-w-48 truncate py-2 pr-4">{r[f.key]}</td>)}
                        <td className="py-2">{bad && <TriangleAlert className="size-4" aria-label="Se omitirá" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line-soft p-6">
              <button disabled={!ready || ok === 0 || pending} onClick={() => start(async () => setResult(await importCustomers(mapped)))} className="btn-primary">
                {pending ? "Importando…" : `Importar ${ok} clientes`}
              </button>
              {!ready && <span className="text-sm text-danger">Elige qué columna es el nombre y cuál el teléfono.</span>}
              <span className="text-sm text-muted">Si un teléfono ya existe, solo se completan sus datos vacíos.</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
