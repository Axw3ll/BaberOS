-- CreateEnum
CREATE TYPE "LoyaltyMode" AS ENUM ('OFF', 'POINTS', 'STAMPS');

-- CreateEnum
CREATE TYPE "StampReward" AS ENUM ('FREE_SERVICE', 'PERCENT', 'AMOUNT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoyaltyKind" ADD VALUE 'STAMP';
ALTER TYPE "LoyaltyKind" ADD VALUE 'REWARD';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageKind" ADD VALUE 'STAMP_ALMOST';
ALTER TYPE "MessageKind" ADD VALUE 'STAMP_REWARD';

-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "autoLoyaltyMsgs" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "loyaltyMode" "LoyaltyMode" NOT NULL DEFAULT 'STAMPS',
ADD COLUMN     "stampMinAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stampReward" "StampReward" NOT NULL DEFAULT 'FREE_SERVICE',
ADD COLUMN     "stampRewardValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stampsRequired" INTEGER NOT NULL DEFAULT 9;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "stampRewards" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stamps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "rewardRedeemed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stampGiven" BOOLEAN NOT NULL DEFAULT false;


-- Barberías que ya usaban puntos los conservan; las demás arrancan con tarjeta de sellos
UPDATE "barbershops" SET "loyaltyMode" = 'POINTS' WHERE "loyaltyPointsPerPeso" > 0;

-- Reglas
ALTER TABLE "customers" ADD CONSTRAINT "customers_stamps_ck" CHECK ("stamps" >= 0 AND "stampRewards" >= 0);
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_stamps_ck" CHECK ("stampsRequired" BETWEEN 2 AND 50 AND "stampRewardValue" >= 0 AND "stampMinAmount" >= 0);
