-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'SERVING', 'DONE', 'LEFT');

-- CreateEnum
CREATE TYPE "PackageKind" AS ENUM ('BUNDLE', 'MEMBERSHIP');

-- CreateEnum
CREATE TYPE "WaitStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'BOOKED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageKind" ADD VALUE 'QUEUE_NEXT';
ALTER TYPE "MessageKind" ADD VALUE 'WAITLIST_OPEN';

-- AlterEnum
ALTER TYPE "SaleItemKind" ADD VALUE 'PACKAGE';

-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "description" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "mapsUrl" TEXT,
ADD COLUMN     "maxDiscountBarber" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "maxDiscountReception" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "noShowLimit" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "noShowPolicy" TEXT NOT NULL DEFAULT 'WARN',
ADD COLUMN     "queueEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "queueMax" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "packageId" UUID;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "monthlyGoal" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "staffId" UUID,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "serviceId" UUID,
    "staffId" UUID,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "source" TEXT NOT NULL DEFAULT 'PANEL',
    "token" TEXT NOT NULL DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text),
    "appointmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PackageKind" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "uses" INTEGER,
    "days" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_services" (
    "packageId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,

    CONSTRAINT "package_services_pkey" PRIMARY KEY ("packageId","serviceId")
);

-- CreateTable
CREATE TABLE "customer_packages" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "packageId" UUID,
    "saleId" UUID,
    "name" TEXT NOT NULL,
    "kind" "PackageKind" NOT NULL,
    "usesTotal" INTEGER,
    "usesLeft" INTEGER,
    "serviceIds" UUID[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_uses" (
    "id" UUID NOT NULL,
    "customerPackageId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "serviceId" UUID,
    "value" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceId" UUID,
    "staffId" UUID,
    "date" DATE NOT NULL,
    "status" "WaitStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_shopId_date_idx" ON "expenses"("shopId", "date");

-- CreateIndex
CREATE INDEX "audit_logs_shopId_createdAt_idx" ON "audit_logs"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_token_key" ON "queue_entries"("token");

-- CreateIndex
CREATE INDEX "queue_entries_shopId_status_createdAt_idx" ON "queue_entries"("shopId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "packages_shopId_active_idx" ON "packages"("shopId", "active");

-- CreateIndex
CREATE INDEX "customer_packages_customerId_status_idx" ON "customer_packages"("customerId", "status");

-- CreateIndex
CREATE INDEX "package_uses_saleId_idx" ON "package_uses"("saleId");

-- CreateIndex
CREATE INDEX "waitlist_entries_shopId_date_status_idx" ON "waitlist_entries"("shopId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_appointmentId_key" ON "reviews"("appointmentId");

-- CreateIndex
CREATE INDEX "reviews_shopId_createdAt_idx" ON "reviews"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_staffId_idx" ON "reviews"("staffId");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_services" ADD CONSTRAINT "package_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_uses" ADD CONSTRAINT "package_uses_customerPackageId_fkey" FOREIGN KEY ("customerPackageId") REFERENCES "customer_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_uses" ADD CONSTRAINT "package_uses_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_ck" CHECK ("amount" > 0);
ALTER TABLE "packages" ADD CONSTRAINT "packages_ck" CHECK ("price" >= 0 AND "days" BETWEEN 1 AND 730 AND ("uses" IS NULL OR "uses" BETWEEN 1 AND 100));
ALTER TABLE "customer_packages" ADD CONSTRAINT "customer_packages_uses_ck" CHECK ("usesLeft" IS NULL OR "usesLeft" >= 0);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_ck" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_modulos_ck" CHECK (
  "maxDiscountBarber" BETWEEN 0 AND 100 AND "maxDiscountReception" BETWEEN 0 AND 100
  AND "queueMax" BETWEEN 1 AND 100 AND "noShowLimit" BETWEEN 1 AND 20 AND "noShowPolicy" IN ('WARN', 'BLOCK'));
ALTER TABLE "staff" ADD CONSTRAINT "staff_goal_ck" CHECK ("monthlyGoal" IS NULL OR "monthlyGoal" >= 0);
