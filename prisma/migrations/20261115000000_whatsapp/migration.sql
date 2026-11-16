-- AlterTable
ALTER TABLE "outbound_messages" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "params" JSONB NOT NULL DEFAULT '[]';

