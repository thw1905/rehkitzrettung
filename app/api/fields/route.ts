import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const n = Number(value);

  if (!Number.isFinite(n)) {
    throw new Error("Ungültiger Zahlenwert.");
  }

  return n;
}

export async function GET() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    if (currentUser.isAdmin) {
      const fields = await db.field.findMany({
        include: {
          owner: true,
          orders: {
            include: {
              operationDayTeam: {
                include: {
                  team: true,
                  pilot: true,
                  members: {
                    include: {
                      user: true,
                    },
                    orderBy: {
                      createdAt: "asc",
                    },
                  },
                },
              },
              pinpoints: {
                orderBy: {
                  sequenceNumber: "asc",
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const normalizedFields = fields.map((field) => ({
        ...field,
        orders: field.orders.map((order) => ({
          ...order,
          team: order.operationDayTeam?.team || null,
        })),
      }));

      return NextResponse.json(normalizedFields);
    }

    const fields = await db.field.findMany({
      where: {
        orders: {
          some: {
            operationDayTeam: {
              is: {
                OR: [
                  { pilotId: currentUser.id },
                  {
                    members: {
                      some: {
                        userId: currentUser.id,
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
      include: {
        owner: true,
        orders: {
          where: {
            operationDayTeam: {
              is: {
                OR: [
                  { pilotId: currentUser.id },
                  {
                    members: {
                      some: {
                        userId: currentUser.id,
                      },
                    },
                  },
                ],
              },
            },
          },
          include: {
            operationDayTeam: {
              include: {
                team: true,
                pilot: true,
                members: {
                  include: {
                    user: true,
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
              },
            },
            pinpoints: {
              orderBy: {
                sequenceNumber: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const normalizedFields = fields.map((field) => ({
      ...field,
      orders: field.orders.map((order) => ({
        ...order,
        team: order.operationDayTeam?.team || null,
      })),
    }));

    return NextResponse.json(normalizedFields);
  } catch (error: any) {
    console.error("Fehler beim Laden der Flächen:", error);

    return NextResponse.json(
      { error: error?.message || "Flächen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    if (!currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Nur Admins dürfen Flächen anlegen." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Flächenname fehlt." },
        { status: 400 }
      );
    }

    if (!body.displayName?.trim()) {
      return NextResponse.json(
        { error: "Anzeigename fehlt." },
        { status: 400 }
      );
    }

    if (!body.areaGeoJson) {
      return NextResponse.json(
        { error: "Fläche wurde nicht gezeichnet." },
        { status: 400 }
      );
    }

    const ownerId = normalizeOptionalString(body.ownerId);
    const notes = normalizeOptionalString(body.notes);
    const locationNote = normalizeOptionalString(body.locationNote);
    const locationLatitude = normalizeOptionalNumber(body.locationLatitude);
    const locationLongitude = normalizeOptionalNumber(body.locationLongitude);

    if ((locationLatitude === null) !== (locationLongitude === null)) {
      return NextResponse.json(
        { error: "Standortpunkt ist unvollständig." },
        { status: 400 }
      );
    }

    if (ownerId) {
      const ownerExists = await db.owner.findUnique({
        where: { id: ownerId },
        select: { id: true },
      });

      if (!ownerExists) {
        return NextResponse.json(
          { error: "Der ausgewählte Ansprechpartner wurde nicht gefunden." },
          { status: 400 }
        );
      }
    }

    const field = await db.field.create({
      data: {
        name: body.name.trim(),
        displayName: body.displayName.trim(),
        notes,
        areaGeoJson: body.areaGeoJson,
        ownerId,
        locationLatitude,
        locationLongitude,
        locationNote,
      },
      include: {
        owner: true,
        orders: {
          include: {
            operationDayTeam: {
              include: {
                team: true,
                pilot: true,
                members: {
                  include: {
                    user: true,
                  },
                  orderBy: {
                    createdAt: "asc",
                  },
                },
              },
            },
            pinpoints: {
              orderBy: {
                sequenceNumber: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    const normalizedField = {
      ...field,
      orders: field.orders.map((order) => ({
        ...order,
        team: order.operationDayTeam?.team || null,
      })),
    };

    return NextResponse.json(normalizedField);
  } catch (error: any) {
    console.error("Fehler beim Speichern der Fläche:", error);

    return NextResponse.json(
      { error: error?.message || "Fläche konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}