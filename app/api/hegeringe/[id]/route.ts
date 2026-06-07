export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function requireAdmin() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser || !currentUser.isAdmin) {
    return null;
  }

  return currentUser;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const currentUser = await requireAdmin();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
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

    const hegering = await db.hegering.update({
      where: { id },
      data: {
        name,
        isActive,
      },
    });

    return NextResponse.json(hegering);
  } catch (error: any) {
    console.error("Hegering speichern Fehler:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Diesen Hegering gibt es bereits." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Hegering konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const currentUser = await requireAdmin();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const revierCount = await db.revier.count({
      where: {
        hegeringId: id,
      },
    });

    if (revierCount > 0) {
      return NextResponse.json(
        {
          error:
            "Dieser Hegering kann nicht gelöscht werden, weil noch Reviere zugeordnet sind.",
        },
        { status: 400 }
      );
    }

    await db.hegering.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Hegering löschen Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hegering konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}