export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const FIELD_CODE_PREFIX = "FL";
const FIELD_CODE_DIGITS = 4;

type FieldForNumbering = {
  id: string;
  name: string;
  displayName: string | null;
  notes: string | null;
  createdAt: Date;
};

function isValidFieldCode(value: string | null | undefined) {
  if (!value) return false;

  return new RegExp(`^${FIELD_CODE_PREFIX}-\\d{${FIELD_CODE_DIGITS},}$`, "i").test(
    value.trim()
  );
}

function parseFieldCodeNumber(value: string | null | undefined) {
  if (!value) return null;

  const match = value.trim().match(
    new RegExp(`^${FIELD_CODE_PREFIX}-(\\d{${FIELD_CODE_DIGITS},})$`, "i")
  );

  if (!match) return null;

  const number = Number(match[1]);

  return Number.isFinite(number) ? number : null;
}

function formatFieldCode(number: number) {
  return `${FIELD_CODE_PREFIX}-${String(number).padStart(FIELD_CODE_DIGITS, "0")}`;
}

function getNextFreeFieldCode(usedNumbers: Set<number>) {
  let next = 1;

  while (usedNumbers.has(next)) {
    next += 1;
  }

  usedNumbers.add(next);

  return formatFieldCode(next);
}

function buildUpdatedNotes(field: FieldForNumbering) {
  const oldDisplayName = (field.displayName || "").trim();

  if (!oldDisplayName || isValidFieldCode(oldDisplayName)) {
    return field.notes;
  }

  const noteLine = `Bisheriger Anzeigename: ${oldDisplayName}`;

  if (!field.notes || !field.notes.trim()) {
    return noteLine;
  }

  if (field.notes.includes(noteLine)) {
    return field.notes;
  }

  return `${field.notes.trim()}\n${noteLine}`;
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const dryRun = body?.dryRun !== false;
    const overwriteExistingNonFlNames = body?.overwriteExistingNonFlNames !== false;

    const fields = await db.field.findMany({
      select: {
        id: true,
        name: true,
        displayName: true,
        notes: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const usedNumbers = new Set<number>();

    for (const field of fields) {
      const number = parseFieldCodeNumber(field.displayName);

      if (number !== null) {
        usedNumbers.add(number);
      }
    }

    const changes = fields
      .map((field) => {
        const oldDisplayName = (field.displayName || "").trim();

        if (isValidFieldCode(oldDisplayName)) {
          return null;
        }

        if (!overwriteExistingNonFlNames && oldDisplayName) {
          return null;
        }

        const nextDisplayName = getNextFreeFieldCode(usedNumbers);
        const nextNotes = buildUpdatedNotes(field);

        return {
          id: field.id,
          name: field.name,
          oldDisplayName: field.displayName,
          newDisplayName: nextDisplayName,
          oldNotes: field.notes,
          newNotes: nextNotes,
        };
      })
      .filter(
        (
          change
        ): change is {
          id: string;
          name: string;
          oldDisplayName: string | null;
          newDisplayName: string;
          oldNotes: string | null;
          newNotes: string | null;
        } => change !== null
      );

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalFields: fields.length,
        changeCount: changes.length,
        preview: changes.slice(0, 50),
        message:
          "Testlauf durchgeführt. Es wurde noch nichts gespeichert. Zum endgültigen Nummerieren dryRun:false senden.",
      });
    }

    await db.$transaction(
      changes.map((change) =>
        db.field.update({
          where: {
            id: change.id,
          },
          data: {
            displayName: change.newDisplayName,
            notes: change.newNotes,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      dryRun: false,
      totalFields: fields.length,
      updatedCount: changes.length,
      updated: changes.map((change) => ({
        id: change.id,
        name: change.name,
        oldDisplayName: change.oldDisplayName,
        newDisplayName: change.newDisplayName,
      })),
      message: `${changes.length} Flächen wurden nummeriert.`,
    });
  } catch (error: any) {
    console.error("Bestehende Flächen nummerieren Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Bestehende Flächen konnten nicht nummeriert werden.",
      },
      { status: 500 }
    );
  }
}