// Matriz de permisos. Se usa en el SERVIDOR para autorizar y en el cliente solo para decidir qué mostrar.
export type RoleName = "OWNER" | "ADMIN" | "RECEPTION" | "BARBER";

export type Perm =
  | "agenda.all"        // ver/gestionar la agenda de todos los barberos
  | "agenda.own"        // ver/gestionar solo su propia columna
  | "clients"
  | "services"
  | "barbers"
  | "booking"           // crear citas / reserva
  | "charge"            // cobrar citas y anticipos
  | "reminders"         // recordatorios y recuperación por WhatsApp
  | "products.sell"
  | "products.manage"
  | "cash.view"         // corte del día completo (incluye gastos y neto)
  | "cash.close"
  | "expenses"
  | "reports"
  | "plans"
  | "settings"
  | "team";

const ALL: Perm[] = ["agenda.all", "agenda.own", "clients", "services", "barbers", "booking", "charge", "reminders", "products.sell", "products.manage", "cash.view", "cash.close", "expenses", "reports", "plans", "settings", "team"];

export const ROLE_PERMS: Record<RoleName, Perm[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  RECEPTION: ["agenda.all", "clients", "services", "barbers", "booking", "charge", "reminders", "products.sell"],
  BARBER: ["agenda.own", "charge"],
};

export function can(role: RoleName, perm: Perm) { return ROLE_PERMS[role].includes(perm); }

export const ROLE_NAMES: Record<RoleName, string> = { OWNER: "Dueño", ADMIN: "Admin", RECEPTION: "Recepción", BARBER: "Barbero" };
