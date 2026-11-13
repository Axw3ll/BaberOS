-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('BASICO', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'RECEPTION', 'BARBER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CHARGED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('PANEL', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "DepositMode" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENTA', 'INSUMOS', 'SUELDOS', 'LIMPIEZA', 'SERVICIOS', 'OTROS');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('TOMORROW', 'TODAY');

-- CreateTable
CREATE TABLE "Barbershop" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "ownerPhone" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT NOT NULL DEFAULT '09:00',
    "closeTime" TEXT NOT NULL DEFAULT '20:00',
    "workDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositMode" "DepositMode" NOT NULL DEFAULT 'FIXED',
    "depositValue" INTEGER NOT NULL DEFAULT 0,
    "loyaltyStampsRequired" INTEGER NOT NULL DEFAULT 5,
    "loyaltyDiscountPercent" INTEGER NOT NULL DEFAULT 100,
    "stripeSecretKeyEnc" TEXT,
    "stripeWebhookSecretEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Barbershop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'BASICO',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "lastPaidAt" TIMESTAMP(3),
    "stripeSessionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL,
    "pinHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "barberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barber" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "commissionPct" INTEGER NOT NULL DEFAULT 40,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "favoriteBarberId" TEXT,
    "loyaltyStamps" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "source" "AppointmentSource" NOT NULL DEFAULT 'PANEL',
    "notes" TEXT,
    "publicToken" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "chargedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "depositApplied" INTEGER NOT NULL DEFAULT 0,
    "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "stripeSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "lowStockAlert" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSale" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosure" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "expectedCash" INTEGER NOT NULL,
    "countedCash" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "totalIncome" INTEGER NOT NULL,
    "totalExpense" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "notes" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "discountAmount" INTEGER,
    "redeemedAppointmentId" TEXT,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp_manual',
    "sentById" TEXT,
    "sentByName" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryLog" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "daysAway" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp_manual',
    "sentById" TEXT,
    "sentByName" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barbershop_slug_key" ON "Barbershop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_barbershopId_key" ON "Subscription"("barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_barberId_key" ON "Member"("barberId");

-- CreateIndex
CREATE INDEX "Member_barbershopId_idx" ON "Member"("barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Barber_barbershopId_idx" ON "Barber"("barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_barbershopId_phone_key" ON "Client"("barbershopId", "phone");

-- CreateIndex
CREATE INDEX "Service_barbershopId_idx" ON "Service"("barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_publicToken_key" ON "Appointment"("publicToken");

-- CreateIndex
CREATE INDEX "Appointment_barbershopId_startAt_idx" ON "Appointment"("barbershopId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_barberId_startAt_idx" ON "Appointment"("barberId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_appointmentId_key" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "Payment_barbershopId_createdAt_idx" ON "Payment"("barbershopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_appointmentId_key" ON "Deposit"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_stripeSessionId_key" ON "Deposit"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Deposit_barbershopId_status_idx" ON "Deposit"("barbershopId", "status");

-- CreateIndex
CREATE INDEX "Expense_barbershopId_date_idx" ON "Expense"("barbershopId", "date");

-- CreateIndex
CREATE INDEX "Product_barbershopId_idx" ON "Product"("barbershopId");

-- CreateIndex
CREATE INDEX "ProductSale_barbershopId_createdAt_idx" ON "ProductSale"("barbershopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosure_barbershopId_date_key" ON "CashClosure"("barbershopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyReward_redeemedAppointmentId_key" ON "LoyaltyReward"("redeemedAppointmentId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_barbershopId_clientId_idx" ON "LoyaltyReward"("barbershopId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_appointmentId_key" ON "Rating"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_appointmentId_kind_key" ON "ReminderLog"("appointmentId", "kind");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_favoriteBarberId_fkey" FOREIGN KEY ("favoriteBarberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosure" ADD CONSTRAINT "CashClosure_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyReward" ADD CONSTRAINT "LoyaltyReward_redeemedAppointmentId_fkey" FOREIGN KEY ("redeemedAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryLog" ADD CONSTRAINT "RecoveryLog_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryLog" ADD CONSTRAINT "RecoveryLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
