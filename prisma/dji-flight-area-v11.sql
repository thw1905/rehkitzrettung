-- DJI_FLIGHT_AREA_V11: ausschliesslich eine NEUE Tabelle und zwei Indizes.
CREATE TABLE "DjiFlightAreaTime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightUsageId" TEXT NOT NULL,
    "orderId" TEXT,
    "bucket" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DjiFlightAreaTime_flightUsageId_bucket_orderId_key" ON "DjiFlightAreaTime"("flightUsageId", "bucket", "orderId");
CREATE INDEX "DjiFlightAreaTime_orderId_createdAt_idx" ON "DjiFlightAreaTime"("orderId", "createdAt");
