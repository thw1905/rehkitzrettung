export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

async function requireAdmin() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser || !currentUser.isAdmin) {
    return null;
  }

  return currentUser;
}

export async function GET() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const hegeringe = await db.hegering.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        reviere: {
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            name: true,
            nummer: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json(hegeringe);
  } catch (error: any) {
    console.error("Hegeringe laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hegeringe konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const name = String(body.name || "").trim();
    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : true;

    if (!name) {
      return NextResponse.json(
        { error: "Name fehlt." },
        { status: 400 }
      );
    }

    const hegering = await db.hegering.create({
      data: {
        name,
        isActive,
      },
    });

    return NextResponse.json(hegering, { status: 201 });
  } catch (error: any) {
    console.error("Hegering anlegen Fehler:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Diesen Hegering gibt es bereits." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Hegering konnte nicht angelegt werden." },
      { status: 500 }
    );
  }
}