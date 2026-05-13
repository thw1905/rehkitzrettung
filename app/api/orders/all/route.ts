import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const orderInclude = {
  owner: true,
  field: true,
  operationDayTeam: {
    include: {
      team: true,
    },
  },
  pinpoints: {
    orderBy: {
      sequenceNumber: "asc" as const,
    },
  },
  reviere: {
    include: {
      revier: {
        include: {
          paechter: {
            include: {
              pachter: true,
            },
            orderBy: {
              createdAt: "asc" as const,
            },
          },
        },
      },
    },
    orderBy: {
      overlapSqm: "desc" as const,
    },
  },
};

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Nicht angemeldet." },
      { status: 401 }
    );
  }

  if (!currentUser.isAdmin) {
    return NextResponse.json(
      { error: "Keine Berechtigung." },
      { status: 403 }
    );
  }

  try {
    const orders = await db.order.findMany({
      orderBy: [
        { status: "asc" },
        { mowingDate: "asc" },
        { createdAt: "desc" },
      ],
      include: orderInclude,
    });

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
