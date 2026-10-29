"use strict";
process.env.NODE_ENV = "production";
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const deleted = await prisma.securedWildLocation.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  console.log(`Wild-Sicherungsorte: ${deleted.count} abgelaufene Punkte geloescht.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
