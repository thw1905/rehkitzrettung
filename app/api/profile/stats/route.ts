import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const user = await db.user.findUnique({
      where: {
        email: session.user.email,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Nutzer nicht gefunden." },
        { status: 404 }
      );
    }

    const fullName = `${user.firstName} ${user.lastName}`.trim();

    const completedOrders = await db.order.findMany({
      where: {
        status: "ERLEDIGT",
      },
      select: {
        id: true,
        executedPilotName: true,
        executedSearchersText: true,
        executionDate: true,
      },
    });

    const myOrders = completedOrders.filter((order) => {
      const isPilot = order.executedPilotName === fullName;
      const isSearcher =
        typeof order.executedSearchersText === "string" &&
        order.executedSearchersText
          .split(",")
          .map((x) => x.trim())
          .includes(fullName);

      return isPilot || isSearcher;
    });

    const uniqueDays = new Set(
      myOrders
        .map((order) =>
          order.executionDate
            ? new Date(order.executionDate).toISOString().slice(0, 10)
            : null
        )
        .filter(Boolean)
    );

    return NextResponse.json({
      totalMissions: myOrders.length,
      totalDays: uniqueDays.size,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden der Profil-Statistik:", error);

    return NextResponse.json(
      { error: error?.message || "Profil-Statistik konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}