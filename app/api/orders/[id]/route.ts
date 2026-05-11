import { NextRequest, NextResponse } from "next/server";
import area from "@turf/area";
import { OrderStatus, PinpointStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { haversineDistanceKm } from "@/lib/geo";

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateOnlyToUtc(dateInput: string | Date) {
  const date =
    typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
}

async function getOrCreateOperationDayFromMowingDate(mowingDate: Date | null) {
  if (!mowingDate) {
    return null;
  }

  const normalizedDate = parseDateOnlyToUtc(mowingDate);

  const existing = await db.operationDay.findUnique({
    where: {
      date: normalizedDate,
    },
  });

  if (existing) {
    return existing;
  }

  return db.operationDay.create({
    data: {
      date: normalizedDate,
      status: "PLANUNG",
    },
  });
}

function buildExecutionSnapshot(order: any) {
  const teamName = order.operationDayTeam?.team?.name || "Unbekanntes Team";
  const pilotName = order.operationDayTeam?.pilot
    ? `${order.operationDayTeam.pilot.firstName} ${order.operationDayTeam.pilot.lastName}`
    : null;

  const searchersText =
    order.operationDayTeam?.members
      ?.map((m: any) => `${m.user.firstName} ${m.user.lastName}`)
      .join(", ") || null;

  let executedAreaSqm: number | null = null;

  try {
    if (order.field?.areaGeoJson) {
      executedAreaSqm = area(order.field.areaGeoJson as any);
    }
  } catch {
    executedAreaSqm = null;
  }

  return {
    executionDate: getTodayStart(),
    executedTeamName: teamName,
    executedPilotName: pilotName,
    executedSearchersText: searchersText,
    executedAreaSqm,
  };
}

function parseOrderStatus(value: unknown): OrderStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("Ungültiger Auftragsstatus.");
  }

  const normalized = value.trim().toUpperCase() as OrderStatus;

  if (!Object.values(OrderStatus).includes(normalized)) {
    throw new Error("Ungültiger Auftragsstatus.");
  }

  return normalized;
}

function parseNonNegativeInt(value: unknown, fallback?: number) {
  if (value === undefined) return fallback;

  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Ungültiger Zahlenwert.");
  }

  return Math.floor(n);
}

function getBlockingPinpoints(
  pinpoints: Array<{ status: PinpointStatus; sequenceNumber: number }>
) {
  return pinpoints.filter(
    (p) =>
      p.status === PinpointStatus.OFFEN ||
      p.status === PinpointStatus.ERREICHT
  );
}

function normalizeOrderResponse(order: any) {
  return {
    ...order,
    team: order.operationDayTeam?.team || null,
  };
}

async function findBestOperationDayTeamForOrder(params: {
  operationDayId: string | null;
  fieldId: string;
}) {
  const { operationDayId, fieldId } = params;

  if (!operationDayId) {
    return null;
  }

  const field = await db.field.findUnique({
    where: { id: fieldId },
    select: {
      id: true,
      locationLatitude: true,
      locationLongitude: true,
    },
  });

  if (
    !field ||
    field.locationLatitude == null ||
    field.locationLongitude == null
  ) {
    return null;
  }

  const teams = await db.operationDayTeam.findMany({
    where: {
      operationDayId,
    },
    include: {
      pilot: {
        select: {
          id: true,
          homeLatitude: true,
          homeLongitude: true,
        },
      },
      members: {
        select: {
          id: true,
        },
      },
      orders: {
        select: {
          id: true,
        },
      },
    },
  });

  let bestTeam: { id: string } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const team of teams) {
    if (
      !team.pilot ||
      team.pilot.homeLatitude == null ||
      team.pilot.homeLongitude == null
    ) {
      continue;
    }

    const distanceKm = haversineDistanceKm(
      {
        lat: team.pilot.homeLatitude,
        lng: team.pilot.homeLongitude,
      },
      {
        lat: field.locationLatitude,
        lng: field.locationLongitude,
      }
    );

    const currentOrderCount = team.orders.length;
    const teamSize = 1 + team.members.length;

    const score = distanceKm + currentOrderCount * 10 - teamSize * 1.5;

    if (score < bestScore) {
      bestScore = score;
      bestTeam = { id: team.id };
    }
  }

  return bestTeam;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();

  const existingOrder = await db.order.findUnique({
    where: { id },
    include: {
      field: true,
      operationDay: true,
      pinpoints: {
        orderBy: {
          sequenceNumber: "asc",
        },
        select: {
          id: true,
          sequenceNumber: true,
          status: true,
        },
      },
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

  if (!existingOrder) {
    return NextResponse.json(
      { error: "Auftrag nicht gefunden." },
      { status: 404 }
    );
  }

  if (existingOrder.status === OrderStatus.ERLEDIGT) {
    return NextResponse.json(
      { error: "Erledigte Aufträge dürfen nicht mehr verändert werden." },
      { status: 403 }
    );
  }

  const userBelongsToThisOrder =
  !!existingOrder.operationDayTeam &&
  (existingOrder.operationDayTeam.pilotId === currentUser.id ||
    existingOrder.operationDayTeam.members.some(
      (member) => member.userId === currentUser.id
    ));

if (!currentUser.isAdmin && !userBelongsToThisOrder) {
  return NextResponse.json(
    { error: "Keine Berechtigung für diesen Auftrag." },
    { status: 403 }
  );
}

const userIsPilotForThisOrder =
  existingOrder.operationDayTeam?.pilotId === currentUser.id;

  try {
    const nextStatus = parseOrderStatus(body.status);
    const wantsToFinish = nextStatus === OrderStatus.ERLEDIGT;
    const confirmWildData =
      body.confirmWildData === true || body.confirmWildData === "true";

    if (wantsToFinish && !confirmWildData) {
      return NextResponse.json(
        {
          error:
            "Bitte bestätige vor dem Beenden, dass alle Wilddaten eingetragen wurden.",
        },
        { status: 400 }
      );
    }

    if (wantsToFinish) {
      const blockingPinpoints = getBlockingPinpoints(existingOrder.pinpoints);

      if (blockingPinpoints.length > 0) {
        const pinpointLabels = blockingPinpoints
          .map((p) => `PinPoint ${p.sequenceNumber}`)
          .join(", ");

        return NextResponse.json(
          {
            error: `Der Auftrag kann noch nicht beendet werden. Es sind noch offene oder laufende PinPoints vorhanden: ${pinpointLabels}.`,
          },
          { status: 400 }
        );
      }
    }

    if (currentUser.isAdmin) {
      const data: any = {
        notes:
          body.notes === undefined
            ? existingOrder.notes ?? null
            : body.notes === null
              ? null
              : String(body.notes),
        status: nextStatus ?? existingOrder.status,
        rehkitzeGesichert: parseNonNegativeInt(
          body.rehkitzeGesichert,
          existingOrder.rehkitzeGesichert ?? 0
        ),
        rehkitzeAbgesprungen: parseNonNegativeInt(
          body.rehkitzeAbgesprungen,
          existingOrder.rehkitzeAbgesprungen ?? 0
        ),
        sonstigesWildGesichert: parseNonNegativeInt(
          body.sonstigesWildGesichert,
          existingOrder.sonstigesWildGesichert ?? 0
        ),
        sonstigesWildAbgesprungen: parseNonNegativeInt(
          body.sonstigesWildAbgesprungen,
          existingOrder.sonstigesWildAbgesprungen ?? 0
        ),
        maulwurfhuegelFehlstelle: parseNonNegativeInt(
          body.maulwurfhuegelFehlstelle,
          existingOrder.maulwurfhuegelFehlstelle ?? 0
        ),
      };

      let shouldTryAutoReassign = false;
      let targetFieldId = existingOrder.fieldId;

      if (body.ownerId !== undefined) {
        data.ownerId = body.ownerId;
      }

      if (body.fieldId !== undefined) {
        data.fieldId = body.fieldId;
        targetFieldId = body.fieldId;

        if (!existingOrder.isManualTeamAssignment) {
          shouldTryAutoReassign = true;
        }
      }

      if (body.mowingDate !== undefined) {
        const mowingDate = body.mowingDate ? new Date(body.mowingDate) : null;
        data.mowingDate = mowingDate;

        const operationDay = await getOrCreateOperationDayFromMowingDate(
          mowingDate
        );
        data.operationDayId = operationDay?.id || null;

        data.operationDayTeamId = null;
        data.isManualTeamAssignment = false;
        shouldTryAutoReassign = true;
      }

      if (body.operationDayTeamId !== undefined) {
        if (!body.operationDayTeamId) {
          data.operationDayTeamId = null;
          data.isManualTeamAssignment = false;
          shouldTryAutoReassign = true;
        } else {
          const selectedOperationDayTeam = await db.operationDayTeam.findUnique({
            where: {
              id: body.operationDayTeamId,
            },
          });

          if (!selectedOperationDayTeam) {
            return NextResponse.json(
              { error: "Tages-Team nicht gefunden." },
              { status: 404 }
            );
          }

          data.operationDayTeamId = selectedOperationDayTeam.id;
          data.operationDayId = selectedOperationDayTeam.operationDayId;
          data.isManualTeamAssignment = true;
          shouldTryAutoReassign = false;
        }
      }

      if (nextStatus && nextStatus !== existingOrder.status) {
        if (nextStatus === OrderStatus.IN_ARBEIT && !existingOrder.startTime) {
          data.startTime = new Date();
          Object.assign(data, buildExecutionSnapshot(existingOrder));
        }

        if (nextStatus === OrderStatus.ERLEDIGT) {
          if (!existingOrder.startTime) {
            data.startTime = new Date();
            Object.assign(data, buildExecutionSnapshot(existingOrder));
          }
          data.endTime = new Date();
        }

        if (nextStatus === OrderStatus.OFFEN) {
          data.endTime = null;
        }
      }

      let order = await db.order.update({
        where: { id },
        data,
        include: {
          owner: true,
          field: true,
          operationDay: true,
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
            orderBy: { sequenceNumber: "asc" },
          },
        },
      });

      if (
        shouldTryAutoReassign &&
        !order.isManualTeamAssignment &&
        order.operationDayId &&
        targetFieldId
      ) {
        const bestTeam = await findBestOperationDayTeamForOrder({
          operationDayId: order.operationDayId,
          fieldId: targetFieldId,
        });

        if (bestTeam) {
          order = await db.order.update({
            where: { id },
            data: {
              operationDayTeamId: bestTeam.id,
              isManualTeamAssignment: false,
            },
            include: {
              owner: true,
              field: true,
              operationDay: true,
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
                orderBy: { sequenceNumber: "asc" },
              },
            },
          });
        }
      }

      return NextResponse.json(normalizeOrderResponse(order));
    }
    if (!userIsPilotForThisOrder) {
  return NextResponse.json(
    { error: "Nur Pilot oder Admin dürfen diesen Auftrag starten oder beenden." },
    { status: 403 }
  );
}

const data: any = {
  status: nextStatus ?? existingOrder.status,
  notes:
    body.notes === undefined
      ? existingOrder.notes
      : body.notes === null
        ? null
        : String(body.notes),

  rehkitzeGesichert: parseNonNegativeInt(
    body.rehkitzeGesichert,
    existingOrder.rehkitzeGesichert ?? 0
  ),
  rehkitzeAbgesprungen: parseNonNegativeInt(
    body.rehkitzeAbgesprungen,
    existingOrder.rehkitzeAbgesprungen ?? 0
  ),
  sonstigesWildGesichert: parseNonNegativeInt(
    body.sonstigesWildGesichert,
    existingOrder.sonstigesWildGesichert ?? 0
  ),
  sonstigesWildAbgesprungen: parseNonNegativeInt(
    body.sonstigesWildAbgesprungen,
    existingOrder.sonstigesWildAbgesprungen ?? 0
  ),
  maulwurfhuegelFehlstelle: parseNonNegativeInt(
    body.maulwurfhuegelFehlstelle,
    existingOrder.maulwurfhuegelFehlstelle ?? 0
  ),
};

if (nextStatus && nextStatus !== existingOrder.status) {
  if (nextStatus === OrderStatus.IN_ARBEIT && !existingOrder.startTime) {
    data.startTime = new Date();
    Object.assign(data, buildExecutionSnapshot(existingOrder));
  }

  if (nextStatus === OrderStatus.ERLEDIGT) {
    if (!existingOrder.startTime) {
      data.startTime = new Date();
      Object.assign(data, buildExecutionSnapshot(existingOrder));
    }

    data.endTime = new Date();
  }

  if (nextStatus === OrderStatus.OFFEN) {
    data.endTime = null;
  }
}

const order = await db.order.update({
  where: { id },
  data,
  include: {
    owner: true,
    field: true,
    operationDay: true,
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
      orderBy: { sequenceNumber: "asc" },
    },
  },
});

return NextResponse.json(normalizeOrderResponse(order));

   
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren des Auftrags:", error);

    return NextResponse.json(
      { error: error?.message || "Auftrag konnte nicht aktualisiert werden." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  if (!currentUser.isAdmin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen Aufträge löschen." },
      { status: 403 }
    );
  }

  const { id } = await context.params;

  const existingOrder = await db.order.findUnique({
    where: { id },
  });

  if (!existingOrder) {
    return NextResponse.json(
      { error: "Auftrag nicht gefunden." },
      { status: 404 }
    );
  }

  if (existingOrder.status === OrderStatus.ERLEDIGT) {
    return NextResponse.json(
      { error: "Erledigte Aufträge dürfen nicht gelöscht werden." },
      { status: 403 }
    );
  }

  await db.order.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}