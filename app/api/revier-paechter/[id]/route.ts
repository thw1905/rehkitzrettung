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

function normalizeOptionalString(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function normalizePachter(pachter: any) {
  return {
    ...pachter,
    reviere: Array.isArray(pachter.reviere)
      ? pachter.reviere
          .map((assignment: any) => assignment.revier)
          .filter(Boolean)
      : [],
  };
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

    const existing = await db.revierPachter.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Revierpächter wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const firstName = normalizeRequiredString(body.firstName, "Vorname");
    const lastName = normalizeRequiredString(body.lastName, "Nachname");

    const pachter = await db.revierPachter.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone: normalizeOptionalString(body.phone),
        email: normalizeOptionalString(body.email),
        street: normalizeOptionalString(body.street),
        zip: normalizeOptionalString(body.zip),
        city: normalizeOptionalString(body.city),
        notes: normalizeOptionalString(body.notes),
      },
      include: {
        reviere: {
          include: {
            revier: {
              select: {
                id: true,
                name: true,
                nummer: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return NextResponse.json(normalizePachter(pachter));
  } catch (error: any) {
    console.error("Revierpächter bearbeiten Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Revierpächter konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
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

    const existing = await db.revierPachter.findUnique({
      where: { id },
      include: {
        reviere: {
          select: { id: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Revierpächter wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.reviere.length > 0) {
      return NextResponse.json(
        {
          error:
            "Dieser Revierpächter ist noch einem oder mehreren Revieren zugeordnet und kann deshalb nicht gelöscht werden.",
        },
        { status: 400 }
      );
    }

    await db.revierPachter.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Revierpächter löschen Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Revierpächter konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}