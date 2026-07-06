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

function getUtcRange(days = 21) {
  const now = new Date();

  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);

  return { start, end };
}

function toDateKeyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const year = new Date().getFullYear();

const start = new Date(Date.UTC(year, 4, 1, 0, 0, 0, 0)); // 01.05.
const end = new Date(Date.UTC(year, 7, 1, 0, 0, 0, 0)); // bis 31.07. inklusive

    const rawAvailabilities = await db.availability.findMany({
      where: {
        userId: currentUser.id,
        date: {
          gte: start,
          lt: end,
        },
      },
      orderBy: [
        { date: "asc" },
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    // Pro Kalendertag nur den neuesten Datensatz zurückgeben
    const byDate = new Map<string, (typeof rawAvailabilities)[number]>();

    for (const item of rawAvailabilities) {
      const key = toDateKeyUtc(item.date);

      if (!byDate.has(key)) {
        byDate.set(key, item);
      }
    }

    return NextResponse.json(Array.from(byDate.values()));
  } catch (error: any) {
    console.error("Fehler beim Laden der Verfügbarkeiten:", error);

    return NextResponse.json(
      { error: error?.message || "Verfügbarkeiten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    if (!currentUser.isApproved) {
      return NextResponse.json(
        { error: "Nur freigegebene Benutzer können ihre Verfügbarkeit pflegen." },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      date?: string;
      status?: "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";
      note?: string | null;
    };

    if (!body.date) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const allowedStatuses = ["OFFEN", "ZUGESAGT", "ABGESAGT", "VIELLEICHT"] as const;

    if (!body.status || !allowedStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(body.date);

    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    // Alt-Dubletten für denselben Kalendertag löschen
    const existingForDay = await db.availability.findMany({
      where: {
        userId: currentUser.id,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    let availability;

    if (existingForDay.length > 0) {
      const keep = existingForDay[0];
      const duplicatesToDelete = existingForDay.slice(1).map((item) => item.id);

      availability = await db.availability.update({
        where: { id: keep.id },
        data: {
          date,
          status: body.status,
          note: body.note?.trim() || null,
        },
      });

      if (duplicatesToDelete.length > 0) {
        await db.availability.deleteMany({
          where: {
            id: {
              in: duplicatesToDelete,
            },
          },
        });
      }
    } else {
      availability = await db.availability.create({
        data: {
          userId: currentUser.id,
          date,
          status: body.status,
          note: body.note?.trim() || null,
        },
      });
    }

    return NextResponse.json(availability);
  } catch (error: any) {
    console.error("Fehler beim Speichern der Verfügbarkeit:", error);

    return NextResponse.json(
      { error: error?.message || "Verfügbarkeit konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}