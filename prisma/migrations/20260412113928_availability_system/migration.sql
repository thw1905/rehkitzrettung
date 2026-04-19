-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFEN',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANUNG',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderPinpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "rawQrText" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFEN',
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reachedAt" DATETIME,
    "rehkitzeGesichert" INTEGER NOT NULL DEFAULT 0,
    "rehkitzeAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildGesichert" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "maulwurfhuegelFehlstelle" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderPinpoint_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Field" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "ownerId" TEXT,
    "areaGeoJson" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Field_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Field" ("areaGeoJson", "createdAt", "displayName", "id", "name", "notes", "ownerId", "updatedAt") SELECT "areaGeoJson", "createdAt", "displayName", "id", "name", "notes", "ownerId", "updatedAt" FROM "Field";
DROP TABLE "Field";
ALTER TABLE "new_Field" RENAME TO "Field";
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFEN',
    "notes" TEXT,
    "mowingDate" DATETIME,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "orderCode" TEXT,
    "orderYear" INTEGER,
    "orderSequence" INTEGER,
    "executionDate" DATETIME,
    "executedTeamName" TEXT,
    "executedPilotName" TEXT,
    "executedCopilotName" TEXT,
    "executedSearchersText" TEXT,
    "executedAreaSqm" REAL,
    "operationDayId" TEXT,
    "rehkitzeGesichert" INTEGER NOT NULL DEFAULT 0,
    "rehkitzeAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildGesichert" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "maulwurfhuegelFehlstelle" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_operationDayId_fkey" FOREIGN KEY ("operationDayId") REFERENCES "OperationDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "endTime", "executedAreaSqm", "executedCopilotName", "executedPilotName", "executedSearchersText", "executedTeamName", "executionDate", "fieldId", "id", "mowingDate", "notes", "orderCode", "orderSequence", "orderYear", "ownerId", "rehkitzeAbgesprungen", "rehkitzeGesichert", "sonstigesWildAbgesprungen", "sonstigesWildGesichert", "startTime", "status", "teamId", "title", "updatedAt") SELECT "createdAt", "endTime", "executedAreaSqm", "executedCopilotName", "executedPilotName", "executedSearchersText", "executedTeamName", "executionDate", "fieldId", "id", "mowingDate", "notes", "orderCode", "orderSequence", "orderYear", "ownerId", "rehkitzeAbgesprungen", "rehkitzeGesichert", "sonstigesWildAbgesprungen", "sonstigesWildGesichert", "startTime", "status", "teamId", "title", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Availability_userId_date_key" ON "Availability"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OperationDay_date_key" ON "OperationDay"("date");
