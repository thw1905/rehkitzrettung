import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const body = await req.json();

    if (!body?.pin || body.pin !== process.env.DEMO_ORDER_PIN) {
      return NextResponse.json({ error: "Falsche PIN." }, { status: 400 });
    }

    const today = new Date();
today.setHours(0, 0, 0, 0);

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const operationDay = await db.operationDay.findFirst({
  where: {
    date: {
      gte: today,
      lt: tomorrow,
    },
  },
});

if (!operationDay) {
  return NextResponse.json(
    { error: "Für heute gibt es noch keinen Einsatztag. Bitte zuerst Teamplanung für heute anlegen." },
    { status: 400 }
  );
}

const operationDayTeam = await db.operationDayTeam.findFirst({
  where: {
    operationDayId: operationDay.id,
  },
  orderBy: {
    createdAt: "asc",
  },
});

if (!operationDayTeam) {
  return NextResponse.json(
    { error: "Für heute ist noch kein Team geplant. Bitte zuerst ein Team für heute zuordnen." },
    { status: 400 }
  );
}

    const owner = await db.owner.create({
      data: {
        firstName: "Demo",
        lastName: "Landwirt",
        street: "Teststraße 1",
        zip: "00000",
        city: "Testort",
        phone: "01777866916",
        email: "demo@example.de",
      },
    });

    const field = await db.field.create({
      data: {
        name: "Demo-Wiese",
        displayName: "TEST / ÜBUNG – Demo-Wiese",
        ownerId: owner.id,
        notes: "Demo-Fläche zur Einweisung.",
        areaGeoJson: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [8.0, 52.0],
                [8.001, 52.0],
                [8.001, 52.001],
                [8.0, 52.001],
                [8.0, 52.0],
              ],
            ],
          },
        },
        locationLatitude: 52.0,
        locationLongitude: 8.0,
        locationNote: "Demo-Treffpunkt",
      },
    });

    const order = await db.order.create({
  data: {
    title: "TESTAUFTRAG – Einweisung",
    orderCode: `DEMO-${Date.now()}`,
    notes: "Dies ist ein Demo-Auftrag zur Einweisung von Piloten und Suchern.",
    status: "OFFEN",
    ownerId: owner.id,
    fieldId: field.id,
    operationDayId: operationDay.id,
    operationDayTeamId: operationDayTeam.id,
    mowingDate: new Date(),
    isDemo: true,
  },
});

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("Demo-Auftrag Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Demo-Auftrag konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}