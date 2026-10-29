"use strict";
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
prisma.$queryRawUnsafe("PRAGMA database_list").then(rows => {
  const p = rows.find(row => row.name === "main")?.file;
  if (!p) throw new Error("Produktive Datenbank nicht gefunden.");
  process.stdout.write(p);
}).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
