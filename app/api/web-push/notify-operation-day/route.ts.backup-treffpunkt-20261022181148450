export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { sendWebPushToUser } from "@/lib/web-push";
import { sendMail } from "@/lib/mail";
import { getRevierOwnerMailTemplate } from "@/lib/revier-owner-mail-template-store";
import { renderRevierMailText } from "@/lib/revier-owner-mail-template";

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

function formatDateGerman(dateString: string) {
  const [year, month, day] = dateString.split("-");
  return `${day}.${month}.${year}`;
}

function getPersonName(person?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!person) return "-";

  const name = `${person.firstName || ""} ${person.lastName || ""}`.trim();

  return name || "-";
}

function getFieldLabel(field?: {
  displayName?: string | null;
  name?: string | null;
} | null) {
  if (!field) return "Unbekannte Fläche";

  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;

  return "Unbekannte Fläche";
}

async function createNotificationForUsers(params: {
  title: string;
  body: string;
  type: string;
  date: Date;
  userIds: Set<string>;
}) {
  const notification = await db.notificationMessage.create({
    data: {
      title: params.title,
      body: params.body,
      type: params.type,
      date: params.date,
      recipients: {
        create: Array.from(params.userIds).map((userId) => ({
          userId,
        })),
      },
    },
  });

  let sentPushes = 0;

  for (const userId of params.userIds) {
    const sent = await sendWebPushToUser(userId, {
      title: notification.title,
      body: notification.body,
      url: `/notifications/${notification.id}`,
    });

    sentPushes += sent;
  }

  return {
    notificationId: notification.id,
    sentPushes,
  };
}

type RevierOwnerMailData = {
  email: string;
  name: string;
  reviere: Set<string>;
  fields: Set<string>;
  landwirtFields: Map<string, Set<string>>;
};

function addRevierOwnerMailData(
  map: Map<string, RevierOwnerMailData>,
  params: {
    email: string | null | undefined;
    name: string;
    revierLabel: string;
    fieldLabel: string;
    landwirtName: string;
  }
) {
  const email = String(params.email || "").trim().toLowerCase();

  if (!email) return;

  if (!map.has(email)) {
    map.set(email, {
      email,
      name: params.name || "-",
      reviere: new Set<string>(),
      fields: new Set<string>(),
      landwirtFields: new Map<string, Set<string>>(),
    });
  }

  const item = map.get(email);

  if (!item) return;

  if (params.revierLabel) {
    item.reviere.add(params.revierLabel);
  }

  if (params.fieldLabel) {
    item.fields.add(params.fieldLabel);
  }

  // Jede betroffene Flaeche wird beim zutreffenden Landwirt gefuehrt.
  const landwirt = params.landwirtName.trim() || "Landwirt nicht hinterlegt";
  if (!item.landwirtFields.has(landwirt)) {
    item.landwirtFields.set(landwirt, new Set<string>());
  }
  if (params.fieldLabel) item.landwirtFields.get(landwirt)!.add(params.fieldLabel);
}

async function notifyAffectedRevierOwnersByEmail(params: {
  date: Date;
  dateString: string;
  displayDate: string;
  meetingText: string;
  operationDayId: string;
}) {
  const operationDay = await db.operationDay.findUnique({
    where: {
      id: params.operationDayId,
    },
    include: {
      teams: {
        include: {
          orders: {
            include: {
              field: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  owner: { select: { firstName: true, lastName: true } },
                },
              },
              // Fallback bei Flaechen ohne eigenen Landwirt: Landwirt am Auftrag.
              owner: { select: { firstName: true, lastName: true } },
              reviere: {
                include: {
                  revier: {
                    include: {
                      paechter: {
                        include: {
                          pachter: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!operationDay) {
    return {
      emailsSent: 0,
      recipients: 0,
      skippedBecauseNoSmtp: false,
      errors: [] as string[],
    };
  }

  const mailByEmail = new Map<string, RevierOwnerMailData>();

  for (const dayTeam of operationDay.teams) {
    for (const order of dayTeam.orders) {
      const fieldLabel = getFieldLabel(order.field);
      const landwirtName = getPersonName(order.field?.owner ?? order.owner);

      for (const orderRevier of order.reviere || []) {
        const revier = orderRevier.revier;

        if (!revier) continue;

        const revierLabel = [revier.nummer, revier.name]
          .filter(Boolean)
          .join(" · ");

        for (const assignment of revier.paechter || []) {
          const pachter = assignment.pachter;

          if (!pachter) continue;

          addRevierOwnerMailData(mailByEmail, {
            email: pachter.email,
            name: getPersonName(pachter),
            revierLabel,
            fieldLabel,
            landwirtName,
          });
        }
      }
    }
  }

  const errors: string[] = [];
  let emailsSent = 0;

  if (mailByEmail.size === 0) {
    return {
      emailsSent: 0,
      recipients: 0,
      skippedBecauseNoSmtp: false,
      errors,
    };
  }

  const hasSmtpConfig =
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM;

  if (!hasSmtpConfig) {
    console.warn(
      "Revierinhaber-E-Mail wurde übersprungen: SMTP-Konfiguration fehlt."
    );

    return {
      emailsSent: 0,
      recipients: mailByEmail.size,
      skippedBecauseNoSmtp: true,
      errors,
    };
  }

  // Vorlage einmal pro Benachrichtigung laden, nicht bei jedem Empfaenger erneut.
  const mailTemplate = await getRevierOwnerMailTemplate();

  for (const recipient of mailByEmail.values()) {
    const revierLines =
      Array.from(recipient.reviere)
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((item) => `- ${item}`)
        .join("\n") || "-";

    const fieldLines =
      Array.from(recipient.fields)
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((item) => `- ${item}`)
        .join("\n") || "-";

    const landwirtLines = Array.from(recipient.landwirtFields.entries())
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([landwirt, labels]) => {
        const fields = Array.from(labels).sort((a, b) => a.localeCompare(b, "de"));
        return `- ${landwirt}: ${fields.join(", ")}`;
      })
      .join("\n") || "- Keine Landwirte hinterlegt";

    const templateValues = {
      paechter: recipient.name,
      datum: params.displayDate,
      uhrzeit: params.meetingText
        ? params.meetingText.replace(/^Treffzeit:\s*/, "").replace(/\.$/, "").trim()
        : "noch nicht festgelegt",
      treffzeit: params.meetingText.trim(),
      reviere: revierLines,
      flaechen: fieldLines,
      landwirte: landwirtLines,
    };
    const subject = renderRevierMailText(mailTemplate.subject, templateValues);
    const text = renderRevierMailText(mailTemplate.body, templateValues);

    try {
      await sendMail({
        to: recipient.email,
        subject,
        text,
      });

      emailsSent += 1;
    } catch (error: any) {
      const message = `E-Mail an ${recipient.email} konnte nicht gesendet werden: ${
        error?.message || "Unbekannter Fehler"
      }`;

      console.error(message);
      errors.push(message);
    }
  }

  return {
    emailsSent,
    recipients: mailByEmail.size,
    skippedBecauseNoSmtp: false,
    errors,
  };
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const body = await req.json();
    const dateString = String(body?.date || "").trim();

    if (!dateString) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(dateString);
    const displayDate = formatDateGerman(dateString);

    const operationDay = await db.operationDay.findUnique({
      where: { date },
      include: {
        teams: {
          include: {
            pilot: true,
            members: {
              include: {
                user: true,
              },
            },
            orders: true,
          },
        },
      },
    });

    if (!operationDay) {
      return NextResponse.json(
        { error: "Für dieses Datum wurde kein Einsatztag gefunden." },
        { status: 404 }
      );
    }

    const meetingText = operationDay.meetingTime
      ? `Treffzeit: ${operationDay.meetingTime} Uhr.`
      : "";

    const plannedUserIds = new Set<string>();

    for (const dayTeam of operationDay.teams) {
      if (dayTeam.pilotId) {
        plannedUserIds.add(dayTeam.pilotId);
      }

      for (const member of dayTeam.members) {
        plannedUserIds.add(member.userId);
      }
    }

    const availableUsers = await db.availability.findMany({
      where: {
        date,
        status: {
          in: ["ZUGESAGT", "VIELLEICHT"],
        },
      },
      select: {
        userId: true,
      },
    });

    const notPlannedUserIds = new Set<string>();

    for (const availability of availableUsers) {
      if (!plannedUserIds.has(availability.userId)) {
        notPlannedUserIds.add(availability.userId);
      }
    }

    let plannedPushes = 0;
    let notPlannedPushes = 0;

    if (plannedUserIds.size > 0) {
      const plannedMessage = `Du bist für den Einsatz am ${displayDate}${
        meetingText ? `, ${meetingText}` : ""
      } eingeplant. Bitte öffne die App, prüfe deine Aufträge und bestätige die Kenntnisnahme.`;

      const result = await createNotificationForUsers({
        title: "🚨 Einsatz geplant",
        body: plannedMessage,
        type: "TEAM_ASSIGNMENT",
        date,
        userIds: plannedUserIds,
      });

      plannedPushes = result.sentPushes;
    }

    if (notPlannedUserIds.size > 0) {
      const notPlannedMessage = `Danke für deine Rückmeldung. Für den Einsatz am ${displayDate} bist du nicht eingeplant und musst nicht kommen.`;

      const result = await createNotificationForUsers({
        title: "✅ Heute frei",
        body: notPlannedMessage,
        type: "NOT_PLANNED",
        date,
        userIds: notPlannedUserIds,
      });

      notPlannedPushes = result.sentPushes;
    }

    const revierOwnerMailResult = await notifyAffectedRevierOwnersByEmail({
      date,
      dateString,
      displayDate,
      meetingText,
      operationDayId: operationDay.id,
    });

    return NextResponse.json({
      success: true,
      plannedUsers: plannedUserIds.size,
      notPlannedUsers: notPlannedUserIds.size,
      plannedPushes,
      notPlannedPushes,
      sentPushes: plannedPushes + notPlannedPushes,
      revierOwnerEmails: {
        recipients: revierOwnerMailResult.recipients,
        sent: revierOwnerMailResult.emailsSent,
        skippedBecauseNoSmtp: revierOwnerMailResult.skippedBecauseNoSmtp,
        errors: revierOwnerMailResult.errors,
      },
    });
  } catch (error: any) {
    console.error("Team-Benachrichtigung Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Team-Benachrichtigung konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}