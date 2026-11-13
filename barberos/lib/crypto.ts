import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}

/** Hash de PIN con scrypt + sal aleatoria. Formato: scrypt$N$sal$hash */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(pin, Buffer.from(saltB64, "base64"), expected.length, { ...PARAMS, N: Number(n) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function newToken() { return randomBytes(32).toString("base64url"); }
export function sha256(s: string) { return createHash("sha256").update(s).digest("hex"); }

// Cifrado AES-256-GCM para llaves de Stripe guardadas por barbería
function key() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET debe tener al menos 32 caracteres");
  return createHash("sha256").update(s).digest();
}
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
