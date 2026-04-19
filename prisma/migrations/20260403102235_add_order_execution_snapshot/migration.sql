-- AlterTable
ALTER TABLE "Order" ADD COLUMN "executedAreaSqm" REAL;
ALTER TABLE "Order" ADD COLUMN "executedCopilotName" TEXT;
ALTER TABLE "Order" ADD COLUMN "executedPilotName" TEXT;
ALTER TABLE "Order" ADD COLUMN "executedSearchersText" TEXT;
ALTER TABLE "Order" ADD COLUMN "executedTeamName" TEXT;
ALTER TABLE "Order" ADD COLUMN "executionDate" DATETIME;
