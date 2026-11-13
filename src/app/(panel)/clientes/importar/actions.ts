"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSection } from "@/lib/auth";

export type ImportRow = { name: string; phone: string; email?: string; birthday?: string; notes?: string; tags?: string };
export type ImportResult = { created: number; updated: number; skipped: { row: number; reason: string }[] };

/** Teléfono a 10 dígitos de México: quita +52, 52, 521 y espacios. */
export async function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return d.length === 10 ? d : null;
}

/** dd/mm/aaaa, aaaa-mm-dd, dd-mm-aaaa o dd/mm (sin año → 1900). */
function parseDate(raw?: string) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/))) {
    d = Number(r[1]); m = Number(r[2]); y = r[3] ? Number(r[3].length === 2 ? `19${r[3]}` : r[3]) : 1900;
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getTime() < Date.now() ? dt : null;
}

export async function importCustomers(rows: ImportRow[]): Promise<ImportResult> {
  const { shop, me } = await requireSection("clientes");
  if (me.role === "BARBER") return { created: 0, updated: 0, skipped: [{ row: 0, reason: "Solo recepción o encargados pueden importar." }] };
  const result: ImportResult = { created: 0, updated: 0, skipped: [] };
  const seen = new Set<string>();
  const tagCache = new Map<string, string>();

  for (const [i, r] of rows.slice(0, 5000).entries()) {
    const n = i + 2; // fila en el archivo (la 1 son los encabezados)
    const name = (r.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const phone = await normalizePhone(r.phone ?? "");
    if (!name) { result.skipped.push({ row: n, reason: "Sin nombre" }); continue; }
    if (!phone) { result.skipped.push({ row: n, reason: `Teléfono no válido: ${r.phone || "vacío"}` }); continue; }
    if (seen.has(phone)) { result.skipped.push({ row: n, reason: "Teléfono repetido en el archivo" }); continue; }
    seen.add(phone);

    const email = r.email?.trim() && /^\S+@\S+\.\S+$/.test(r.email.trim()) ? r.email.trim().toLowerCase() : null;
    const birthday = parseDate(r.birthday);
    const notes = r.notes?.trim().slice(0, 1000) || null;
    const existing = await prisma.customer.findUnique({ where: { shopId_phone: { shopId: shop.id, phone } } });
    let id: string;
    if (existing) {
      // Solo completa lo que falta: nunca pisa datos que ya capturaron en la barbería
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...(!existing.email && email && { email }),
          ...(!existing.birthday && birthday && { birthday }),
          ...(!existing.notes && notes && { notes }),
        },
      });
      id = existing.id;
      result.updated++;
    } else {
      id = (await prisma.customer.create({ data: { shopId: shop.id, name, phone, email, birthday, notes } })).id;
      result.created++;
    }

    for (const tagName of (r.tags ?? "").split(/[,;|]/).map((t) => t.trim().slice(0, 30)).filter(Boolean)) {
      let tagId = tagCache.get(tagName.toLowerCase());
      if (!tagId) {
        tagId = (await prisma.tag.upsert({ where: { shopId_name: { shopId: shop.id, name: tagName } }, update: {}, create: { shopId: shop.id, name: tagName } })).id;
        tagCache.set(tagName.toLowerCase(), tagId);
      }
      await prisma.customerTag.upsert({ where: { customerId_tagId: { customerId: id, tagId } }, update: {}, create: { customerId: id, tagId } });
    }
  }
  revalidatePath("/clientes");
  return result;
}
