import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";
import { receiveDjiMapElement } from "@/lib/dji/import-element";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApi();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  const orders = await db.order.findMany({
    where: { isDemo: true, status: { not: "ERLEDIGT" } },
    select: { id: true, title: true, orderCode: true }, orderBy: { createdAt: "desc" }, take: 50,
  });
  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const latitude = body.latitude;
  const longitude = body.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Ungueltige GPS-Koordinaten." }, { status: 400 });
  }
  const order = await db.order.findUnique({ where: { id: orderId }, select: { isDemo: true, status: true } });
  if (!order?.isDemo || order.status === "ERLEDIGT") {
    return NextResponse.json({ error: "Testimport ausschliesslich in offene Demo-Auftraege." }, { status: 403 });
  }
  const userId = String((admin.session?.user as { id?: string } | undefined)?.id || "");
  if (!userId) return NextResponse.json({ error: "Benutzer-ID fehlt." }, { status: 401 });
  const workspaceId = "dji-test-workspace";
  const elementId = "test-" + randomUUID();
  try {
    const received = await receiveDjiMapElement({
      workspaceId, groupId: "dji-test-group", pilotUserId: userId, orderId,
      allowImport: true,
      element: {
        id: elementId, name: "DJI-Testpunkt",
        resource: { type: 0, content: { type: "Feature", geometry: { type: "Point", coordinates: [longitude, latitude] }, properties: { clampToGround: true } } },
      },
    });
    return NextResponse.json({ success: true, ...received }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("DJI test import", error);
    return NextResponse.json({ error: "Testimport fehlgeschlagen." }, { status: 500 });
  }
}
