import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export const bad = (msg: string, code?: string) => new ApiError(400, msg, code);
export const notFound = (msg = "No encontrado") => new ApiError(404, msg);
export const conflict = (msg: string, code?: string) => new ApiError(409, msg, code);
export const forbidden = (msg = "No tienes permiso para esto") => new ApiError(403, msg, "FORBIDDEN");

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function prismaCode(e: unknown): string | undefined {
  const any = e as { code?: string; message?: string; cause?: { code?: string } };
  return any?.code ?? any?.cause?.code;
}

/** Envuelve un handler para devolver errores en JSON de forma uniforme. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof ZodError) return json({ error: "Datos inválidos: " + e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), code: "VALIDATION" }, 400);
      const code = prismaCode(e);
      const msg = String((e as Error)?.message ?? "");
      if (msg.includes("appointment_no_overlap") || code === "23P01")
        return json({ error: "Ese barbero ya tiene una cita en ese horario.", code: "OVERLAP" }, 409);
      if (code === "P2002") return json({ error: "Registro duplicado: esta operación ya se hizo.", code: "DUPLICATE" }, 409);
      if (code === "P2025") return json({ error: "No encontrado" }, 404);
      console.error(e);
      return json({ error: "Error interno del servidor" }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw bad("Cuerpo JSON inválido"); }
}
