-- AlterTable
ALTER TABLE "Field" ADD COLUMN "locationLatitude" REAL;
ALTER TABLE "Field" ADD COLUMN "locationLongitude" REAL;
ALTER TABLE "Field" ADD COLUMN "locationNote" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "homeLatitude" REAL;
ALTER TABLE "User" ADD COLUMN "homeLongitude" REAL;
