export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const reviere = await db.revier.findMany({
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
      orderBy: [
        { nummer: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(reviere);
  } catch (error: any) {
    console.error("Reviere laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Reviere konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}