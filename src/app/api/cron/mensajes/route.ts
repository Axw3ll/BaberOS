import { runAutomations } from "@/lib/messages";

/**
 * Tarea programada: prepara los mensajes automáticos de todas las barberías (y los envía cuando haya API de WhatsApp).
 * Protegida con CRON_SECRET: Vercel Cron manda "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("No autorizado", { status: 401 });
  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return Response.json(await runAutomations(base));
}
