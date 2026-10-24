-- Additive DJI Stage 1 tables. Existing data is not modified.
CREATE TABLE "DjiPilotSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "pilotUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DjiPilotSession_tokenHash_key" ON "DjiPilotSession"("tokenHash");
CREATE INDEX "DjiPilotSession_pilotUserId_expiresAt_idx" ON "DjiPilotSession"("pilotUserId", "expiresAt");

CREATE TABLE "DjiMapElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pilotUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "resource" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pinpointId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DjiMapElement_workspaceId_elementId_key" ON "DjiMapElement"("workspaceId", "elementId");
CREATE UNIQUE INDEX "DjiMapElement_pinpointId_key" ON "DjiMapElement"("pinpointId");
CREATE INDEX "DjiMapElement_pilotUserId_receivedAt_idx" ON "DjiMapElement"("pilotUserId", "receivedAt");
CREATE INDEX "DjiMapElement_orderId_idx" ON "DjiMapElement"("orderId");
