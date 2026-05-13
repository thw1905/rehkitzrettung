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

export async function GET() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const paechter = await db.revierPachter.findMany({
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
      ],
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

    return NextResponse.json(paechter.map(normalizePachter));
  } catch (error: any) {
    console.error("Revierpächter laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Revierpächter konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const body = await req.json();

    const firstName = normalizeRequiredString(body.firstName, "Vorname");
    const lastName = normalizeRequiredString(body.lastName, "Nachname");

    const pachter = await db.revierPachter.create({
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
        },
      },
    });

    return NextResponse.json(normalizePachter(pachter));
  } catch (error: any) {
    console.error("Revierpächter anlegen Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Revierpächter konnte nicht angelegt werden." },
      { status: 400 }
    );
  }
}