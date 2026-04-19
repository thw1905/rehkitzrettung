import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

function parseSortOrder(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const n = Number(value);

  if (!Number.isFinite(n)) {
    throw new Error("Ungültige Reihenfolge.");
  }

  return Math.floor(n);
}

export async function GET() {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const slots = await db.team.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(slots);
  } catch (error: any) {
    console.error("Fehler beim Laden der Team-Slots:", error);

    return NextResponse.json(
      { error: error?.message || "Team-Slots konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json();

    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Name fehlt." },
        { status: 400 }
      );
    }

    const lastSlot = await db.team.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const slot = await db.team.create({
      data: {
        name,
        sortOrder: parseSortOrder(body.sortOrder, (lastSlot?.sortOrder || 0) + 1),
        isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      },
    });

    return NextResponse.json(slot);
  } catch (error: any) {
    console.error("Fehler beim Anlegen des Team-Slots:", error);

    return NextResponse.json(
      { error: error?.message || "Team-Slot konnte nicht angelegt werden." },
      { status: 500 }
    );
  }
}