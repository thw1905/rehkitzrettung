import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderid: string }> }
) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const { orderid } = await context.params;
    const body = (await req.json()) as {
      operationDayTeamId?: string | null;
    };

    const order = await db.order.findUnique({
      where: { id: orderid },
      include: {
        operationDay: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
    }

    if (!order.operationDayId) {
      return NextResponse.json(
        { error: "Dieser Auftrag hat noch keinen Einsatztag." },
        { status: 400 }
      );
    }

    if (!body.operationDayTeamId) {
      const updated = await db.order.update({
        where: { id: orderid },
        data: {
          operationDayTeamId: null,
          isManualTeamAssignment: false,
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
              },
            },
          },
        },
      });

      return NextResponse.json({
        ...updated,
        team: updated.operationDayTeam?.team || null,
      });
    }

    const dayTeam = await db.operationDayTeam.findUnique({
      where: {
        id: body.operationDayTeamId,
      },
      include: {
        team: true,
      },
    });

    if (!dayTeam) {
      return NextResponse.json(
        { error: "Tages-Team nicht gefunden." },
        { status: 404 }
      );
    }

    if (dayTeam.operationDayId !== order.operationDayId) {
      return NextResponse.json(
        { error: "Auftrag und Tages-Team gehören nicht zum selben Einsatztag." },
        { status: 400 }
      );
    }

    const updated = await db.order.update({
      where: { id: orderid },
      data: {
        operationDayTeamId: dayTeam.id,
        isManualTeamAssignment: true,
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
            },
          },
        },
      },
    });

    return NextResponse.json({
      ...updated,
      team: updated.operationDayTeam?.team || null,
    });
  } catch (error: any) {
    console.error("Fehler beim Zuweisen des Auftrags:", error);

    return NextResponse.json(
      { error: error?.message || "Auftrag konnte nicht zugewiesen werden." },
      { status: 500 }
    );
  }
}