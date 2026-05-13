export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

function normalizeRequiredString(value: unknown, fieldName: string) {
  const text = String(value || "").trim();

  if (!text) {
    throw new Error(`${fieldName} fehlt.`);
  }

  return text;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await context.params;
    const body = await req.json();

    const pachterId = normalizeRequiredString(body.pachterId, "Revierpächter");

    const revier = await db.revier.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!revier) {
      return NextResponse.json(
        { error: "Revier wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const pachter = await db.revierPachter.findUnique({
      where: { id: pachterId },
      select: { id: true },
    });

    if (!pachter) {
      return NextResponse.json(
        { error: "Revierpächter wurde nicht gefunden." },
        { status: 404 }
      );
    }

    await db.revierPachterAssignment.upsert({
      where: {
        revierId_pachterId: {
          revierId: id,
          pachterId,
        },
      },
      update: {},
      create: {
        revierId: id,
        pachterId,
      },
    });

    const updatedRevier = await db.revier.findUnique({
      where: { id },
      include: {
        paechter: {
          include: {
            pachter: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return NextResponse.json(updatedRevier);
  } catch (error: any) {
    console.error("Revierpächter hinzufügen Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Revierpächter konnte nicht hinzugefügt werden.",
      },
      { status: 400 }
    );
  }
}