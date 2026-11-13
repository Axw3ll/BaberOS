-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'BARBER', 'RECEPTIONIST');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('WALK_IN', 'PHONE', 'ONLINE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'INTERNAL_USE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "SaleItemKind" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barbershops" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.16,
    "slotMinutes" INTEGER NOT NULL DEFAULT 15,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barbershops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_hours" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "shop_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closures" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "userId" UUID,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BARBER',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "takesAppointments" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "serviceCommission" DECIMAL(5,4) NOT NULL DEFAULT 0.40,
    "productCommission" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_hours" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "staff_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "bookableOnline" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_services" (
    "staffId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,

    CONSTRAINT "staff_services_pkey" PRIMARY KEY ("staffId","serviceId")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "AppointmentSource" NOT NULL DEFAULT 'WALK_IN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_services" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "sku" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(10,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stockAfter" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2),
    "note" TEXT,
    "saleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "folio" INTEGER NOT NULL,
    "customerId" UUID,
    "appointmentId" UUID,
    "chargedById" UUID,
    "status" "SaleStatus" NOT NULL DEFAULT 'PAID',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL,
    "tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "kind" "SaleItemKind" NOT NULL,
    "serviceId" UUID,
    "productId" UUID,
    "staffId" UUID,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "barbershops_slug_key" ON "barbershops"("slug");

-- CreateIndex
CREATE INDEX "barbershops_ownerId_idx" ON "barbershops"("ownerId");

-- CreateIndex
CREATE INDEX "shop_hours_shopId_weekday_idx" ON "shop_hours"("shopId", "weekday");

-- CreateIndex
CREATE INDEX "closures_shopId_startsAt_idx" ON "closures"("shopId", "startsAt");

-- CreateIndex
CREATE INDEX "staff_shopId_active_idx" ON "staff"("shopId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "staff_shopId_userId_key" ON "staff"("shopId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_shopId_email_key" ON "staff"("shopId", "email");

-- CreateIndex
CREATE INDEX "staff_hours_staffId_weekday_idx" ON "staff_hours"("staffId", "weekday");

-- CreateIndex
CREATE INDEX "time_off_staffId_startsAt_idx" ON "time_off"("staffId", "startsAt");

-- CreateIndex
CREATE INDEX "services_shopId_active_idx" ON "services"("shopId", "active");

-- CreateIndex
CREATE INDEX "customers_shopId_name_idx" ON "customers"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_phone_key" ON "customers"("shopId", "phone");

-- CreateIndex
CREATE INDEX "appointments_shopId_startsAt_idx" ON "appointments"("shopId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_staffId_startsAt_idx" ON "appointments"("staffId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_customerId_idx" ON "appointments"("customerId");

-- CreateIndex
CREATE INDEX "appointment_services_appointmentId_idx" ON "appointment_services"("appointmentId");

-- CreateIndex
CREATE INDEX "products_shopId_active_idx" ON "products"("shopId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_sku_key" ON "products"("shopId", "sku");

-- CreateIndex
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_appointmentId_key" ON "sales"("appointmentId");

-- CreateIndex
CREATE INDEX "sales_shopId_createdAt_idx" ON "sales"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shopId_folio_key" ON "sales"("shopId", "folio");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_staffId_idx" ON "sale_items"("staffId");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- AddForeignKey
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_hours" ADD CONSTRAINT "shop_hours_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closures" ADD CONSTRAINT "closures_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_chargedById_fkey" FOREIGN KEY ("chargedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
