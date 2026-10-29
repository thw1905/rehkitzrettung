-- Nur eine NEUE Tabelle und ihre Indizes. Keine Aenderung bestehender Tabellen.
CREATE TABLE "SecuredWildLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "pinpointId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "accuracyMeters" REAL,
    "rehkitzeGesichert" INTEGER NOT NULL DEFAULT 0,
    "sonstigesWildGesichert" INTEGER NOT NULL DEFAULT 0,
    "shareToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SecuredWildLocation_pinpointId_key" ON "SecuredWildLocation"("pinpointId");
CREATE UNIQUE INDEX "SecuredWildLocation_shareToken_key" ON "SecuredWildLocation"("shareToken");
CREATE INDEX "SecuredWildLocation_expiresAt_idx" ON "SecuredWildLocation"("expiresAt");
CREATE INDEX "SecuredWildLocation_orderId_idx" ON "SecuredWildLocation"("orderId");
