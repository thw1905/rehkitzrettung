export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function PATCH(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const body = await req.json();

    const operationDayTeamId = String(body.operationDayTeamId || "").trim();
    const orderIds: string[] = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (!operationDayTeamId) {
      return NextResponse.json(
        { error: "Tages-Team fehlt." },
        { status: 400 }
      );
    }

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "Keine Aufträge übergeben." },
        { status: 400 }
      );
    }

    const operationDayTeam = await db.operationDayTeam.findUnique({
      where: {
        id: operationDayTeamId,
      },
      select: {
        id: true,
      },
    });

    if (!operationDayTeam) {
      return NextResponse.json(
        { error: "Tages-Team wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const orders = await db.order.findMany({
      where: {
        id: {
          in: orderIds,
        },
        operationDayTeamId,
      },
      select: {
        id: true,
      },
    });

    const validOrderIds = new Set(orders.map((order) => order.id));

    const invalidIds = orderIds.filter((id) => !validOrderIds.has(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "Mindestens ein Auftrag gehört nicht zu diesem Tages-Team oder wurde nicht gefunden.",
        },
        { status: 400 }
      );
    }

    await db.$transaction(
      orderIds.map((orderId, index) =>
        db.order.update({
          where: {
            id: orderId,
          },
          data: {
            sortOrder: index + 1,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("Auftragsreihenfolge speichern Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Auftragsreihenfolge konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}