export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (process.env.NODE_ENV === "production") {
      const expected = process.env.NEXTAUTH_URL
        ? new URL(process.env.NEXTAUTH_URL).origin
        : req.nextUrl.origin;
      return parsed.origin === expected;
    }
    return parsed.host === req.headers.get("host") &&
      (parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    return false;
  }
}

/** Löscht ausschließlich eine vollständig offene, noch nicht übernommene Mähanfrage. */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUserWithTeams();
    if (!currentUser?.isAdmin || !currentUser.isApproved) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "Ungültiger Ursprung." }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Mähanfrage fehlt." }, { status: 400 });

    const outcome = await db.$transaction(async (tx) => {
      const request = await tx.mowingRequest.findUnique({
        where: { id },
        select: {
          id: true, status: true, ownerId: true, mowingDate: true,
          fields: { select: { fieldId: true } },
        },
      });
      if (!request) return "NOT_FOUND" as const;
      if (request.status !== "OFFEN") return "NOT_OPEN" as const;

      const fieldIds = request.fields.map((item) => item.fieldId);
      if (fieldIds.length) {
        // Auch teilübernommene Anfragen dürfen keine Aufträge verwaisen lassen.
        const linkedOrder = await tx.order.findFirst({
          where: {
            ownerId: request.ownerId,
            mowingDate: request.mowingDate,
            fieldId: { in: fieldIds },
          },
          select: { id: true },
        });
        if (linkedOrder) return "HAS_ORDERS" as const;
      }

      const deleted = await tx.mowingRequest.deleteMany({ where: { id, status: "OFFEN" } });
      return deleted.count === 1 ? "DELETED" as const : "NOT_OPEN" as const;
    });

    if (outcome === "NOT_FOUND") {
      return NextResponse.json({ error: "Mähanfrage nicht gefunden." }, { status: 404 });
    }
    if (outcome === "NOT_OPEN") {
      return NextResponse.json({ error: "Nur offene Mähanfragen können gelöscht werden." }, { status: 409 });
    }
    if (outcome === "HAS_ORDERS") {
      return NextResponse.json({
        error: "Zu dieser Mähanfrage existieren bereits Aufträge. Sie kann nicht gelöscht werden.",
      }, { status: 409 });
    }
    return NextResponse.json({ success: true, message: "Offene Mähanfrage gelöscht." });
  } catch (error) {
    console.error("Offene Mähanfrage löschen Fehler:", error);
    return NextResponse.json({ error: "Mähanfrage konnte nicht gelöscht werden." }, { status: 500 });
  }
}
