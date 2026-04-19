import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function extractCoords(text: string) {
  try {
    const cleaned = text
      .trim()
      .replace(/^<+/, "")
      .replace(/>+$/, "")
      .replace("htts://", "https://")
      .replace("http://", "https://");

    if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(cleaned)) {
      const [lat, lng] = cleaned.split(",");
      const latitude = Number(lat.trim());
      const longitude = Number(lng.trim());

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }

    const url = new URL(cleaned);
    const query = url.searchParams.get("query");

    if (!query) return null;

    const decoded = decodeURIComponent(query).trim();
    const parts = decoded.split(",");

    if (parts.length !== 2) return null;

    const latitude = Number(parts[0].trim());
    const longitude = Number(parts[1].trim());

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await context.params;

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      operationDayTeamId: true,
      operationDayTeam: {
        select: {
          id: true,
          pilotId: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Auftrag nicht gefunden." },
      { status: 404 }
    );
  }

  const userBelongsToThisOrder =
    !!order.operationDayTeam &&
    (order.operationDayTeam.pilotId === currentUser.id ||
      order.operationDayTeam.members.some(
        (member) => member.userId === currentUser.id
      ));

  if (!currentUser.isAdmin && !userBelongsToThisOrder) {
    return NextResponse.json(
      { error: "Keine Berechtigung für diesen Auftrag." },
      { status: 403 }
    );
  }

  if (order.status === "ERLEDIGT") {
    return NextResponse.json(
      { error: "Für erledigte Aufträge können keine PinPoints mehr angelegt werden." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const rawQrText = String(body.rawQrText || "").trim();

    if (!rawQrText) {
      return NextResponse.json(
        { error: "QR-Inhalt fehlt." },
        { status: 400 }
      );
    }

    const coords = extractCoords(rawQrText);

    if (!coords) {
      return NextResponse.json(
        { error: "QR-Code konnte nicht gelesen werden." },
        { status: 400 }
      );
    }

    const count = await db.orderPinpoint.count({
      where: { orderId: id },
    });

    const pinpoint = await db.orderPinpoint.create({
      data: {
        orderId: id,
        rawQrText,
        latitude: coords.latitude,
        longitude: coords.longitude,
        sequenceNumber: count + 1,
      },
    });

    return NextResponse.json(pinpoint);
  } catch (error: any) {
    console.error("Fehler beim Anlegen des PinPoints:", error);

    return NextResponse.json(
      { error: error?.message || "PinPoint konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}