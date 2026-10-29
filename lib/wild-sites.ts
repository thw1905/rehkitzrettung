// REHKITZ_WILD_SITES_V1 – komplett getrennt von den DJI-PinPoints.
import { db } from "@/lib/db";

type AuthUser = { id: string; role?: string | null; isAdmin?: boolean; isApproved?: boolean };

const berlin = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function parts(date: Date) {
  const p = berlin.formatToParts(date);
  const n = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return { y: n("year"), m: n("month"), d: n("day"), h: n("hour"), min: n("minute"), s: n("second") };
}
function offsetAt(epoch: number): number {
  const p = parts(new Date(epoch));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(epoch / 1000) * 1000;
}
// Zielzeit 00:00 Uhr des Folgetages in Europe/Berlin, auch beim Sommerzeitwechsel.
export function nextBerlinMidnight(now = new Date()): Date {
  const p = parts(now);
  const following = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  const wallUtc = Date.UTC(following.getUTCFullYear(), following.getUTCMonth(), following.getUTCDate());
  let t = wallUtc - offsetAt(wallUtc);
  t = wallUtc - offsetAt(t);
  return new Date(t);
}

export function wildSiteRole(user: AuthUser | null | undefined): boolean {
  return !!user?.isApproved && !!(user.isAdmin || user.role === "PILOT" || user.role === "SUCHER");
}

export async function allowedOrder(user: AuthUser, orderId: string): Promise<boolean> {
  if (!wildSiteRole(user) || !orderId) return false;
  if (user.isAdmin) return !!(await db.order.findUnique({ where: { id: orderId }, select: { id: true } }));
  const team = await db.operationDayTeam.findFirst({
    where: {
      orders: { some: { id: orderId } },
      OR: [{ pilotId: user.id }, { members: { some: { userId: user.id } } }],
    },
    select: { id: true },
  });
  return !!team;
}

export async function accessibleOrderIds(user: AuthUser): Promise<string[]> {
  if (!wildSiteRole(user)) return [];
  const teams = await db.operationDayTeam.findMany({
    where: { OR: [{ pilotId: user.id }, { members: { some: { userId: user.id } } }] },
    select: { id: true },
  });
  if (!teams.length) return [];
  return (await db.order.findMany({
    where: { operationDayTeamId: { in: teams.map(t => t.id) } }, select: { id: true },
  })).map(x => x.id);
}
