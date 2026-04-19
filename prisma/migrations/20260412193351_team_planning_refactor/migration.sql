/*
  Warnings:

  - You are about to drop the `TeamMember` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `teamId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `copilotId` on the `Team` table. All the data in the column will be lost.
  - You are about to drop the column `pilotId` on the `Team` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "TeamMember_teamId_userId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TeamMember";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "OperationDayTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationDayId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "pilotId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperationDayTeam_operationDayId_fkey" FOREIGN KEY ("operationDayId") REFERENCES "OperationDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperationDayTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperationDayTeam_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationDayTeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationDayTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationDayTeamMember_operationDayTeamId_fkey" FOREIGN KEY ("operationDayTeamId") REFERENCES "OperationDayTeam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperationDayTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "operationDayTeamId" TEXT,
    "rehkitzeGesichert" INTEGER NOT NULL DEFAULT 0,
    "rehkitzeAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildGesichert" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "maulwurfhuegelFehlstelle" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_operationDayId_fkey" FOREIGN KEY ("operationDayId") REFERENCES "OperationDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_operationDayTeamId_fkey" FOREIGN KEY ("operationDayTeamId") REFERENCES "OperationDayTeam" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "endTime", "executedAreaSqm", "executedCopilotName", "executedPilotName", "executedSearchersText", "executedTeamName", "executionDate", "fieldId", "id", "maulwurfhuegelFehlstelle", "mowingDate", "notes", "operationDayId", "orderCode", "orderSequence", "orderYear", "ownerId", "rehkitzeAbgesprungen", "rehkitzeGesichert", "sonstigesWildAbgesprungen", "sonstigesWildGesichert", "startTime", "status", "title", "updatedAt") SELECT "createdAt", "endTime", "executedAreaSqm", "executedCopilotName", "executedPilotName", "executedSearchersText", "executedTeamName", "executionDate", "fieldId", "id", "maulwurfhuegelFehlstelle", "mowingDate", "notes", "operationDayId", "orderCode", "orderSequence", "orderYear", "ownerId", "rehkitzeAbgesprungen", "rehkitzeGesichert", "sonstigesWildAbgesprungen", "sonstigesWildGesichert", "startTime", "status", "title", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Team" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OperationDayTeam_operationDayId_teamId_key" ON "OperationDayTeam"("operationDayId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationDayTeamMember_operationDayTeamId_userId_key" ON "OperationDayTeamMember"("operationDayTeamId", "userId");
