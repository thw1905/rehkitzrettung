import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { allowedOrder, accessibleOrderIds, nextBerlinMidnight, wildSiteRole } from "@/lib/wild-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
function shareUrl(req: NextRequest, token: string) {
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL ||
    `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
  return new URL(`/sicherungsort/${token}`, base).toString();
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!wildSiteRole(user)) return fail("Nicht berechtigt.", 403);
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  if (orderId && !(await allowedOrder(user!, orderId))) return fail("Kein Zugriff auf diesen Auftrag.", 403);
  const accessible = user!.isAdmin ? null : await accessibleOrderIds(user!);
  const sites = await db.securedWildLocation.findMany({
    where: {
      expiresAt: { gt: new Date() },
      ...(orderId ? { orderId } : accessible ? { orderId: { in: accessible } } : {}),
    },
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, orderId: true, pinpointId: true, latitude: true, longitude: true,
      rehkitzeGesichert: true, sonstigesWildGesichert: true, createdAt: true,
      expiresAt: true, shareToken: true },
  });
  return NextResponse.json({ sites: sites.map(s => ({ ...s,
    url: shareUrl(req, s.shareToken),
    shareToken: undefined,
  })) }, { headers });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!wildSiteRole(user)) return fail("Nicht berechtigt.", 403);
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
      if (new URL(origin).host !== host) return fail("Ungueltiger Ursprung.", 403);
    } catch { return fail("Ungueltiger Ursprung.", 403); }
  }
  const body = await req.json().catch(() => null);
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const pinpointId = typeof body?.pinpointId === "string" ? body.pinpointId : "";
  const latitude = body?.latitude;
  const longitude = body?.longitude;
  const accuracyMeters = body?.accuracyMeters;
  if (!orderId || !pinpointId || typeof latitude !== "number" || typeof longitude !== "number" ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
      (accuracyMeters != null && (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10000))) {
    return fail("Ungueltiger GPS-Standort.", 400);
  }
  if (!(await allowedOrder(user!, orderId))) return fail("Kein Zugriff auf diesen Auftrag.", 403);
  const pp = await db.orderPinpoint.findFirst({ where: { id: pinpointId, orderId, status: "ERLEDIGT" },
    select: { rehkitzeGesichert: true, sonstigesWildGesichert: true } });
  if (!pp || (pp.rehkitzeGesichert ?? 0) + (pp.sonstigesWildGesichert ?? 0) <= 0) {
    return fail("Zuerst Wildzahlen am erreichten PinPoint speichern.", 409);
  }
  const expiresAt = nextBerlinMidnight();
  try {
    const site = await db.securedWildLocation.upsert({
      where: { pinpointId },
      create: { orderId, pinpointId, createdByUserId: user!.id, latitude, longitude,
        accuracyMeters: accuracyMeters ?? null,
        rehkitzeGesichert: pp.rehkitzeGesichert ?? 0,
        sonstigesWildGesichert: pp.sonstigesWildGesichert ?? 0,
        expiresAt, shareToken: randomBytes(32).toString("hex") },
      update: { latitude, longitude, accuracyMeters: accuracyMeters ?? null,
        rehkitzeGesichert: pp.rehkitzeGesichert ?? 0,
        sonstigesWildGesichert: pp.sonstigesWildGesichert ?? 0,
        expiresAt },
      select: { id: true, expiresAt: true, shareToken: true },
    });
    return NextResponse.json({ success: true, id: site.id,
      expiresAt: site.expiresAt.toISOString(),
      url: shareUrl(req, site.shareToken),
    }, { status: 201, headers });
  } catch (error) {
    console.error("Wild-Sicherungsort konnte nicht gespeichert werden:", error);
    return fail("Sicherungsort konnte nicht gespeichert werden.", 500);
  }
}
