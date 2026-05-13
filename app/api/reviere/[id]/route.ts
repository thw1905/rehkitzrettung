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

export async function PATCH(
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

    const name = normalizeRequiredString(body.name, "Reviername");

    const existing = await db.revier.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Revier wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const revier = await db.revier.update({
      where: { id },
      data: {
        name,
      },
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

    return NextResponse.json(revier);
  } catch (error: any) {
    console.error("Revier speichern Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Revier konnte nicht gespeichert werden.",
      },
      { status: 400 }
    );
  }
}