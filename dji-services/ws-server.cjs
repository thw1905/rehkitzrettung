"use strict";
/** DJI Cloud API stage 3A: authenticated, loopback-only WebSocket endpoint.
 * No message processing, persistence, MQTT, map syncing or PinPoint import.
 */
const http = require("node:http");
const { createHash } = require("node:crypto");
const { WebSocketServer } = require("ws");
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");

// Next.js-style environment resolution; never print loaded values.
loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} });
if (process.env.DJI_WS_ENABLED !== "true") {
  console.error("DJI WebSocket deaktiviert. Erst nach Einrichtung DJI_WS_ENABLED=true setzen.");
  process.exit(2);
}
if (!process.env.DJI_WORKSPACE_ID || !process.env.DATABASE_URL) {
  console.error("DJI_WORKSPACE_ID oder DATABASE_URL fehlt.");
  process.exit(2);
}

const db = new PrismaClient();
const port = Number(process.env.DJI_WS_LOCAL_PORT || 3001);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  console.error("Ungueltiger DJI_WS_LOCAL_PORT."); process.exit(2);
}
const clients = new Set();
const server = http.createServer((_request, response) => {
  response.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
  response.end("Not found");
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, clientTracking: false });

async function sessionValid(hash) {
  const now = new Date();
  const session = await db.djiPilotSession.findUnique({
    where: { tokenHash: hash },
    select: {
      revokedAt: true, expiresAt: true, workspaceId: true,
      pilotUserId: true,
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= now ||
      session.workspaceId !== process.env.DJI_WORKSPACE_ID) return false;
  const user = await db.user.findUnique({
    where: { id: session.pilotUserId },
    select: { isApproved: true, isAdmin: true, role: true },
  });
  return !!(user?.isApproved && (user.isAdmin || user.role === "PILOT"));
}

function deny(socket, code) {
  try {
    socket.end(`HTTP/1.1 ${code} ${code === 401 ? "Unauthorized" : "Not Found"}\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n`);
  } catch { socket.destroy(); }
}

server.on("upgrade", async (request, socket, head) => {
  // Query tokens must never be logged. Nginx location /dji-ws must also set access_log off.
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/dji-ws" || request.method !== "GET") return deny(socket, 404);
    if (clients.size >= 15 || (request.url || "").length > 500) return deny(socket, 401);
    const token = url.searchParams.get("x-auth-token") || "";
    if (!/^[0-9a-f]{64}$/i.test(token)) return deny(socket, 401);
    const hash = createHash("sha256").update(token).digest("hex");
    if (!(await sessionValid(hash))) return deny(socket, 401);
    wss.handleUpgrade(request, socket, head, (ws) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => { try { ws.close(); } catch {} });
      ws.on("message", () => { /* intentionally ignore arbitrary client messages */ });
      // Session revocation/expiry must also invalidate an already-open socket.
      const check = setInterval(async () => {
        try { if (!(await sessionValid(hash))) ws.close(1008, "Session invalid"); }
        catch { ws.close(1011, "Verification unavailable"); }
      }, 30000);
      check.unref();
      ws.once("close", () => clearInterval(check));
      console.log("DJI-WebSocket: authentifizierte Verbindung aufgebaut (ohne Zugangsdaten).");
    });
  } catch {
    deny(socket, 401);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`DJI-WebSocket-Testserver lauscht ausschliesslich lokal auf 127.0.0.1:${port}.`);
});

async function shutdown() {
  for (const ws of clients) ws.close(1001, "Server stop");
  server.close();
  await db.$disconnect();
}
process.on("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
process.on("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
