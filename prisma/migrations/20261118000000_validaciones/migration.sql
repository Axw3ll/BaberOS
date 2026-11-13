-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "received" DECIMAL(10,2);


-- Segunda barrera: aunque algo se saltara la validación de la app, la base no acepta estos datos.
-- NOT VALID: se aplican a todo lo nuevo sin revisar lo que ya existía (la migración no puede fallar por datos viejos).
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts_ck"
  CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "tip" >= 0 AND "total" >= 0 AND "tax" >= 0 AND "discount" <= "subtotal") NOT VALID;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_amounts_ck"
  CHECK ("unitPrice" >= 0 AND "total" >= 0 AND "commission" >= 0 AND "quantity" <= 99) NOT VALID;
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_ck"
  CHECK ("received" IS NULL OR "received" >= "amount") NOT VALID;
ALTER TABLE "products" ADD CONSTRAINT "products_more_ck"
  CHECK (("cost" IS NULL OR "cost" >= 0) AND "minStock" >= 0) NOT VALID;
ALTER TABLE "staff" ADD CONSTRAINT "staff_commission_ck"
  CHECK ("serviceCommission" BETWEEN 0 AND 1 AND "productCommission" BETWEEN 0 AND 1) NOT VALID;
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_amounts_ck"
  CHECK ("openingCash" >= 0 AND "withdrawals" >= 0 AND "countedCash" >= 0) NOT VALID;
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_amount_ck" CHECK ("amount" > 0) NOT VALID;
