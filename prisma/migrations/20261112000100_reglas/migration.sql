-- Reglas que Prisma no puede expresar en el schema.

-- Un barbero no puede tener dos citas empalmadas (canceladas y no-shows no cuentan).
-- La base de datos lo garantiza aunque dos personas reserven al mismo tiempo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_ck" CHECK ("endsAt" > "startsAt");
ALTER TABLE "time_off"     ADD CONSTRAINT "time_off_time_ck"     CHECK ("endsAt" > "startsAt");
ALTER TABLE "closures"     ADD CONSTRAINT "closures_time_ck"     CHECK ("endsAt" > "startsAt");

ALTER TABLE "shop_hours" ADD CONSTRAINT "shop_hours_ck" CHECK (
  "weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_ck" CHECK (
  "weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

ALTER TABLE "services"   ADD CONSTRAINT "services_ck"   CHECK ("price" >= 0 AND "minutes" > 0);
ALTER TABLE "products"   ADD CONSTRAINT "products_ck"   CHECK ("price" >= 0 AND "stock" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_ck" CHECK ("quantity" > 0);
ALTER TABLE "payments"   ADD CONSTRAINT "payments_ck"   CHECK ("amount" > 0);
