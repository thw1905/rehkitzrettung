import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function getRange(days = 21) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + days);

  return { start, end };
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const daysParam = Number(searchParams.get("days") || "21");
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 21;

    const { start, end } = getRange(days);

    const users = await db.user.findMany({
      where: {
        isApproved: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        isAdmin: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const availabilities = await db.availability.findMany({
      where: {
        date: {
          gte: start,
          lt: end,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            isAdmin: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { user: { lastName: "asc" } }],
    });

    const grouped: Record<
      string,
      {
        date: string;
        zugesagt: number;
        abgesagt: number;
        vielleicht: number;
        offen: number;
        entries: {
          userId: string;
          firstName: string;
          lastName: string;
          role: string;
          isAdmin: boolean;
          status: string;
          note: string | null;
        }[];
      }
    > = {};

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);

      grouped[key] = {
        date: key,
        zugesagt: 0,
        abgesagt: 0,
        vielleicht: 0,
        offen: 0,
        entries: [],
      };
    }

    const byDateUser = new Map<string, (typeof availabilities)[number]>();

    for (const item of availabilities) {
      byDateUser.set(`${dateKey(item.date)}_${item.userId}`, item);
    }

    for (const [key, group] of Object.entries(grouped)) {
      for (const user of users) {
        const found = byDateUser.get(`${key}_${user.id}`);
        const status = found?.status || "OFFEN";
        const note = found?.note || null;

        if (status === "ZUGESAGT") group.zugesagt += 1;
        else if (status === "ABGESAGT") group.abgesagt += 1;
        else if (status === "VIELLEICHT") group.vielleicht += 1;
        else group.offen += 1;

        group.entries.push({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isAdmin: user.isAdmin,
          status,
          note,
        });
      }
    }

    return NextResponse.json(Object.values(grouped));
  } catch (error: any) {
    console.error("Fehler beim Laden der Admin-Verfügbarkeiten:", error);

    return NextResponse.json(
      { error: error?.message || "Verfügbarkeiten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}