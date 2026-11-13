import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export * from "./generated/prisma/client.ts";

const g = globalThis as unknown as { __prisma?: PrismaClient };

function make() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = g.__prisma ?? make();
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
