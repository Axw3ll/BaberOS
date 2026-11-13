-- Regla anti-choques a nivel base de datos: un barbero no puede tener dos citas activas traslapadas.
-- La validación también se hace en el servidor con mensaje claro, esto cubre carreras entre peticiones simultáneas.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "barberId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

-- Montos nunca negativos
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_nonneg" CHECK ("amount" >= 0 AND "loyaltyDiscount" >= 0 AND "depositApplied" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "product_stock_nonneg" CHECK ("stock" >= 0);
ALTER TABLE "Rating" ADD CONSTRAINT "rating_stars_range" CHECK ("stars" BETWEEN 1 AND 5);
