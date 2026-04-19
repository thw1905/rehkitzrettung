import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function GET() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  const [
    ordersTotal,
    ordersOpen,
    ordersInProgress,
    ordersDone,
    teamsTotal,
    fieldsTotal,
    ownersTotal,
    helpersTotal,
  ] = await Promise.all([
    db.order.count(),
    db.order.count({ where: { status: "OFFEN" } }),
    db.order.count({ where: { status: "IN_ARBEIT" } }),
    db.order.count({ where: { status: "ERLEDIGT" } }),
    db.team.count(),
    db.field.count(),
    db.owner.count(),
    db.user.count(),
  ]);

  return NextResponse.json({
    orders: {
      total: ordersTotal,
      open: ordersOpen,
      inProgress: ordersInProgress,
      done: ordersDone,
    },
    teams: {
      total: teamsTotal,
    },
    fields: {
      total: fieldsTotal,
    },
    owners: {
      total: ownersTotal,
    },
    helpers: {
      total: helpersTotal,
    },
  });
}