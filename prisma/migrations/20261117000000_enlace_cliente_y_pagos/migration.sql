-- CreateEnum
CREATE TYPE "PayoutFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "payoutFrequency" "PayoutFrequency" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "payoutWeekday" INTEGER NOT NULL DEFAULT 6;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "token" TEXT NOT NULL DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text);

-- CreateIndex
CREATE UNIQUE INDEX "customers_token_key" ON "customers"("token");


ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_payout_ck" CHECK ("payoutWeekday" BETWEEN 0 AND 6);
