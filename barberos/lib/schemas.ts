import { z } from "zod";

export const ServiceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).nullable().optional(),
  price: z.number().int().min(0).max(10_000_000), // centavos
  durationMin: z.number().int().min(5).max(480),
  active: z.boolean().optional(),
});

export const BarberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  specialty: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  commissionPct: z.number().int().min(0).max(100),
  active: z.boolean().optional(),
});

export const ClientSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().email().nullable().optional().or(z.literal("").transform(() => null)),
  notes: z.string().max(1000).nullable().optional(),
  favoriteBarberId: z.string().nullable().optional(),
});

export const ExpenseSchema = z.object({
  concept: z.string().trim().min(2).max(120),
  category: z.enum(["RENTA", "INSUMOS", "SUELDOS", "LIMPIEZA", "SERVICIOS", "OTROS"]),
  amount: z.number().int().min(1).max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const ProductSchema = z.object({
  name: z.string().trim().min(2).max(80),
  price: z.number().int().min(0),
  cost: z.number().int().min(0),
  stock: z.number().int().min(0).optional(),
  lowStockAlert: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});
