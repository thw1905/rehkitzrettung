/*
  Warnings:

  - A unique constraint covering the columns `[orderCode]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderSequence" INTEGER;
ALTER TABLE "Order" ADD COLUMN "orderYear" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");
