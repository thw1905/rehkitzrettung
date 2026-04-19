-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
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
    "rehkitzeGesichert" INTEGER NOT NULL DEFAULT 0,
    "rehkitzeAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildGesichert" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildAbgesprungen" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "endTime", "executedAreaSqm", "executedCopilotName", "executedPilotName", "executedSearchersText", "executedTeamName", "executionDate", "fieldId", "id", "mowingDate", "notes", "orderCode", "orderSequence", "orderYear", "ownerId", "startTime", "status", "teamId", "title", "updatedAt") SELECT "createdAt", "endTime", "executedAreaSqm", "executedCopilotName", "executedPilotName", "executedSearchersText", "executedTeamName", "executionDate", "fieldId", "id", "mowingDate", "notes", "orderCode", "orderSequence", "orderYear", "ownerId", "startTime", "status", "teamId", "title", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
