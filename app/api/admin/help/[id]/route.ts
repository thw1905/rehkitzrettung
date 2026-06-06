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

    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const sortOrder = Number(body.sortOrder || 0);
    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : true;

    if (!title) {
      return NextResponse.json(
        { error: "Titel fehlt." },
        { status: 400 }
      );
    }

    const article = await db.helpArticle.update({
      where: { id },
      data: {
        title,
        content,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive,
      },
    });

    return NextResponse.json(article);
  } catch (error: any) {
    console.error("Hilfe-Kapitel speichern Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hilfe-Kapitel konnte nicht gespeichert werden." },
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

    await db.helpArticle.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Hilfe-Kapitel löschen Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hilfe-Kapitel konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}