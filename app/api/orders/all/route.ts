import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Nicht angemeldet." },
      { status: 401 }
    );
  }

  try {
    const orders = await db.order.findMany({
      orderBy: [
        { status: "asc" },
        { mowingDate: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        owner: true,
        field: true,
        operationDayTeam: {
          include: {
            team: true,
          },
        },
        pinpoints: {
          orderBy: {
            sequenceNumber: "asc",
          },
        },
      },
    });

    // Übergangs-Kompatibilität fürs bestehende Frontend:
    // Liefert wieder ein "team"-Feld, obwohl intern jetzt operationDayTeam verwendet wird.
    const normalizedOrders = orders.map((order) => ({
      ...order,
      team: order.operationDayTeam?.team || null,
    }));

    return NextResponse.json(normalizedOrders);
  } catch (error: any) {
    console.error("Fehler beim Laden aller Aufträge:", error);

    return NextResponse.json(
      { error: error?.message || "Aufträge konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}