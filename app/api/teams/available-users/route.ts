import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function normalizeDateOnly(input: string) {
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

    const date = normalizeDateOnly(dateParam);

    const users = await db.user.findMany({
      where: {
        isApproved: true,
      },
      include: {
        availabilities: {
          where: {
            date,
          },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const availableUsers = users
      .map((user) => {
        const availability = user.availabilities[0];
        const status = availability?.status || "OFFEN";

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isAdmin: user.isAdmin,
          availabilityStatus: status,
          availabilityNote: availability?.note || null,
        };
      })
      .filter(
        (user) =>
          user.availabilityStatus === "ZUGESAGT" ||
          user.availabilityStatus === "VIELLEICHT"
      );

    const pilots = availableUsers.filter((user) => user.role === "PILOT");

    const searchers = availableUsers;

    return NextResponse.json({
      date: date.toISOString(),
      pilots,
      searchers,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden verfügbarer Benutzer:", error);

    return NextResponse.json(
      { error: error?.message || "Verfügbare Benutzer konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}