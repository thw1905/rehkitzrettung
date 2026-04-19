import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function GET() {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const teamSlots = await db.team.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    const teams = teamSlots.map((team) => ({
      id: team.id,
      name: team.name,
      pilot: null,
      copilot: null,
      members: [],
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    }));

    return NextResponse.json(teams);
  } catch (error: any) {
    console.error("Fehler beim Laden der Team-Slots:", error);

    return NextResponse.json(
      { error: error?.message || "Team-Slots konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
