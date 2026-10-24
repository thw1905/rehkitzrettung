import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export function hashDjiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function checkDjiSession(header: string | null, workspaceId: string) {
  if (!header || !/^[a-f0-9]{64}$/i.test(header)) return null;
  const session = await db.djiPilotSession.findUnique({ where: { tokenHash: hashDjiToken(header) } });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.workspaceId !== workspaceId) return null;
  const user = await db.user.findUnique({ where: { id: session.pilotUserId }, select: { isApproved: true, role: true, isAdmin: true } });
  if (!user?.isApproved || (!user.isAdmin && user.role !== "PILOT")) return null;
  return session;
}

export async function createDjiSession(userId: string, orderId: string, workspaceId: string) {
  const rawToken = randomBytes(32).toString("hex");
  // A pilot can change controllers, but sessions expire and can be revoked.
  await db.djiPilotSession.create({
    data: {
      tokenHash: hashDjiToken(rawToken), pilotUserId: userId,
      orderId, workspaceId, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  return rawToken;
}
