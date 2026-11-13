-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('TRIAL', 'BASIC', 'PRO');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('CONFIRMATION', 'REMINDER_24H', 'REMINDER_2H', 'NO_SHOW', 'REVIEW', 'REBOOK', 'BIRTHDAY');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "token" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text || (gen_random_uuid())::text, '-', '');

-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "autoBirthday" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoNoShow" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoRebook" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoReminder24h" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoReminder2h" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoReview" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "googleReviewUrl" TEXT,
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + '14 days'::interval);

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "payoutId" UUID;

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "appointmentId" UUID,
    "kind" "MessageKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cash_closures" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "closedById" UUID,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashSales" DECIMAL(10,2) NOT NULL,
    "cardSales" DECIMAL(10,2) NOT NULL,
    "transferSales" DECIMAL(10,2) NOT NULL,
    "withdrawals" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(10,2) NOT NULL,
    "countedCash" DECIMAL(10,2) NOT NULL,
    "difference" DECIMAL(10,2) NOT NULL,
    "tickets" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payouts" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "paidById" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "items" INTEGER NOT NULL,
    "upTo" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbound_messages_shopId_status_dueAt_idx" ON "outbound_messages"("shopId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_shopId_dedupeKey_key" ON "outbound_messages"("shopId", "dedupeKey");

-- CreateIndex
CREATE INDEX "cash_closures_shopId_periodEnd_idx" ON "cash_closures"("shopId", "periodEnd");

-- CreateIndex
CREATE INDEX "commission_payouts_shopId_createdAt_idx" ON "commission_payouts"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "commission_payouts_staffId_idx" ON "commission_payouts"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_token_key" ON "appointments"("token");

-- CreateIndex
CREATE UNIQUE INDEX "barbershops_stripeCustomerId_key" ON "barbershops"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "barbershops_stripeSubscriptionId_key" ON "barbershops"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "commission_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reglas
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_time_ck" CHECK ("periodEnd" > "periodStart");
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_ck" CHECK ("amount" >= 0 AND "items" > 0);
