-- CreateEnum
CREATE TYPE "CustomerOrigin" AS ENUM ('WALK_BY', 'REFERRAL', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'GOOGLE', 'ONLINE_BOOKING', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "LoyaltyKind" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'DONE');

-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "lostAfterDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "loyaltyPesoPerPoint" DECIMAL(6,3) NOT NULL DEFAULT 0.10,
ADD COLUMN     "loyaltyPointsPerPeso" DECIMAL(6,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "acceptsMarketing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "birthday" DATE,
ADD COLUMN     "origin" "CustomerOrigin",
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preferredStaffId" UUID,
ADD COLUMN     "referredById" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'nickel',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tags" (
    "customerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("customerId","tagId")
);

-- CreateTable
CREATE TABLE "customer_activities" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "staffId" UUID,
    "type" "ActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID,
    "assignedToId" UUID,
    "createdById" UUID,
    "title" TEXT NOT NULL,
    "dueOn" DATE NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_movements" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "kind" "LoyaltyKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "note" TEXT,
    "saleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_shopId_name_key" ON "tags"("shopId", "name");

-- CreateIndex
CREATE INDEX "customer_tags_tagId_idx" ON "customer_tags"("tagId");

-- CreateIndex
CREATE INDEX "customer_activities_customerId_createdAt_idx" ON "customer_activities"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "tasks_shopId_doneAt_dueOn_idx" ON "tasks"("shopId", "doneAt", "dueOn");

-- CreateIndex
CREATE INDEX "tasks_customerId_idx" ON "tasks"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_movements_customerId_createdAt_idx" ON "loyalty_movements"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "campaigns_shopId_createdAt_idx" ON "campaigns"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "campaign_recipients_customerId_idx" ON "campaign_recipients"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_customerId_key" ON "campaign_recipients"("campaignId", "customerId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_preferredStaffId_fkey" FOREIGN KEY ("preferredStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tags" ADD CONSTRAINT "customer_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reglas
ALTER TABLE "customers" ADD CONSTRAINT "customers_points_ck" CHECK ("points" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_points_ck" CHECK ("pointsRedeemed" >= 0);
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_loyalty_ck"
  CHECK ("loyaltyPointsPerPeso" >= 0 AND "loyaltyPesoPerPoint" > 0 AND "lostAfterDays" BETWEEN 15 AND 730);
