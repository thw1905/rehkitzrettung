import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function parseDateOnlyToUtc(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error("Ungültiges Datum.");
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

async function getOrCreateOperationDay(date: Date) {
  try {
    return await db.operationDay.create({
      data: {
        date,
        status: "PLANUNG",
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      const existing = await db.operationDay.findUnique({
        where: { date },
      });

      if (existing) return existing;
    }

    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(dateParam);
    const operationDay = await getOrCreateOperationDay(date);

    const [orders, dayTeams] = await Promise.all([
      db.order.findMany({
        where: {
          operationDayId: operationDay.id,
        },
        include: {
          owner: true,
          field: true,
          operationDayTeam: {
            include: {
              team: true,
              pilot: true,
              members: {
                include: {
                  user: true,
                },
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
          },
          pinpoints: {
            orderBy: {
              sequenceNumber: "asc",
            },
          },
        },
        orderBy: [
          { status: "asc" },
          { createdAt: "asc" },
        ],
      }),
      db.operationDayTeam.findMany({
        where: {
          operationDayId: operationDay.id,
        },
        include: {
          team: true,
          pilot: true,
          members: {
            include: {
              user: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          orders: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          team: {
            sortOrder: "asc",
          },
        },
      }),
    ]);

    const normalizedOrders = orders.map((order) => ({
      ...order,
      team: order.operationDayTeam?.team || null,
    }));

    return NextResponse.json({
      operationDay: {
  id: operationDay.id,
  date: operationDay.date.toISOString().slice(0, 10),
  status: operationDay.status,
  meetingTime: operationDay.meetingTime || "",
},
      orders: normalizedOrders,
      dayTeams,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden der Tages-Zuordnung:", error);

    return NextResponse.json(
      { error: error?.message || "Tages-Zuordnung konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}