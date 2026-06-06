export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const articles = await db.helpArticle.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { title: "asc" },
      ],
    });

    return NextResponse.json({ articles });
  } catch (error: any) {
    console.error("Hilfe laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hilfe konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}