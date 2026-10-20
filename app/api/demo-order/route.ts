export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

/**
 * Anlegen einer reinen Demoauftrag-Vorlage.
 *
 * Absichtlich KEINE Pruefung auf Saisonkalender, OperationDay oder Teamplanung:
 * Ein Demoauftrag muss auch ausserhalb der Saison erstellt werden koennen.
 * Die Zuordnung von Pilot/Suchern erfolgt im Admin-GPS-Testmodus, der aus dieser
 * Vorlage einen eigenen Testeinsatz mit Testteam erzeugt.
 */
function todayInGermany(): string {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser?.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    // Sicherheit: Eine versehentlich fehlende Umgebungsvariable darf
    // die PIN-Pruefung nicht stillschweigend abschalten.
    const configuredPin = process.env.DEMO_ORDER_PIN;
    if (!configuredPin) {
      console.error("DEMO_ORDER_PIN ist nicht konfiguriert.");
      return NextResponse.json(
        { error: "Die Demo-PIN ist auf dem Server nicht eingerichtet." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body?.pin !== "string" || body.pin !== configuredPin) {
      return NextResponse.json(
        { error: "Falsche PIN." },
        { status: 400 }
      );
    }

    // Die GPS-Testseite verwendet ebenfalls den deutschen Kalendertag
    // als UTC-Datumswert (YYYY-MM-DDT00:00:00Z).
    const mowingDate = new Date(`${todayInGermany()}T00:00:00.000Z`);

    // Alle drei Datensaetze gemeinsam anlegen: Bei einem Fehler bleibt
    // keine verwaiste Demo-Flaeche oder ein Demo-Landwirt zurueck.
    const order = await db.$transaction(async (tx) => {
      const owner = await tx.owner.create({
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

      const field = await tx.field.create({
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

      return tx.order.create({
        data: {
          title: "TESTAUFTRAG – Einweisung",
          orderCode: `DEMO-${Date.now()}-${randomUUID().slice(0, 6)}`,
          notes: "Dies ist eine Demoauftrag-Vorlage zur Einweisung von Piloten und Suchern. Für die Durchführung im Admin-GPS-Testmodus ein Testteam zuordnen.",
          status: "OFFEN",
          ownerId: owner.id,
          fieldId: field.id,
          mowingDate,
          isDemo: true,
          // Bewusst keine operationDayId / operationDayTeamId.
          // Beide Relationen sind optional, die echte Teamplanung bleibt unberuehrt.
        },
      });
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: unknown) {
    console.error("Demo-Auftrag Fehler:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Demo-Auftrag konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}
