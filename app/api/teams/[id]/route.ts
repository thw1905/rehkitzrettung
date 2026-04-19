import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

function validateTeamInput(body: {
  name?: string;
  pilotId?: string;
  copilotId?: string;
  searcherIds?: string[];
}) {
  const searcherIds = (body.searcherIds || []).filter(Boolean);

  if (!body.name?.trim()) {
    return "Teamname fehlt.";
  }

  if (!body.pilotId) {
    return "Pilot fehlt.";
  }

  if (searcherIds.length < 1 || searcherIds.length > 6) {
    return "Ein Team muss 1 bis 6 Sucher haben.";
  }

  if (body.copilotId && body.copilotId === body.pilotId) {
    return "Pilot und Copilot dürfen nicht dieselbe Person sein.";
  }

  if (searcherIds.includes(body.pilotId)) {
    return "Der Pilot darf nicht gleichzeitig Sucher sein.";
  }

  if (body.copilotId && searcherIds.includes(body.copilotId)) {
    return "Der Copilot darf nicht gleichzeitig Sucher sein.";
  }

  const uniqueSearcherIds = new Set(searcherIds);
  if (uniqueSearcherIds.size !== searcherIds.length) {
    return "Ein Sucher wurde mehrfach ausgewählt.";
  }

  return null;
}

async function isUserAlreadyAssignedElsewhere(args: {
  currentTeamId: string;
  pilotId: string;
  copilotId?: string;
  searcherIds: string[];
}) {
  const candidateIds = [
    args.pilotId,
    ...(args.copilotId ? [args.copilotId] : []),
    ...args.searcherIds,
  ];

  const uniqueIds = [...new Set(candidateIds)];

  const teams = await db.team.findMany({
    where: {
      id: {
        not: args.currentTeamId,
      },
    },
    include: {
      members: true,
    },
  });

  for (const team of teams) {
    const assignedIds = new Set<string>();

    assignedIds.add(team.pilotId);
    if (team.copilotId) assignedIds.add(team.copilotId);
    for (const member of team.members) {
      assignedIds.add(member.userId);
    }

    for (const userId of uniqueIds) {
      if (assignedIds.has(userId)) {
        return true;
      }
    }
  }

  return false;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as any;

    const validationError = validateTeamInput(body);
    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

  const rawSearcherIds = Array.isArray((body as any).searcherIds)
  ? ((body as any).searcherIds as unknown[])
  : [];

const searcherIds = [
  ...new Set(
    rawSearcherIds
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
  ),
];

    const existingTeam = await db.team.findUnique({
      where: { id },
    });

    if (!existingTeam) {
      return NextResponse.json(
        { error: "Team nicht gefunden." },
        { status: 404 }
      );
    }

    const alreadyAssigned = await isUserAlreadyAssignedElsewhere({
      currentTeamId: id,
      pilotId: body.pilotId,
      copilotId: body.copilotId || undefined,
      searcherIds,
    });

    if (alreadyAssigned) {
      return NextResponse.json(
        { error: "Mindestens eine ausgewählte Person ist bereits einem anderen Team zugeordnet." },
        { status: 400 }
      );
    }

    await db.teamMember.deleteMany({
      where: { teamId: id },
    });

    const team = await db.team.update({
      where: { id },
      data: {
        name: body.name.trim(),
        pilotId: body.pilotId,
        copilotId: body.copilotId || null,
        members: {
          create: searcherIds.map((userId) => ({
            userId,
          })),
        },
      },
      include: {
        pilot: true,
        copilot: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return NextResponse.json(team);
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren des Teams:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Team konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await context.params;

    await db.teamMember.deleteMany({
      where: { teamId: id },
    });

    await db.team.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fehler beim Löschen des Teams:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Team konnte nicht gelöscht werden.",
      },
      { status: 500 }
    );
  }
}