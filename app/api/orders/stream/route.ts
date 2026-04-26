import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getUserTeamIds(currentUser: any) {
  const teamIds = new Set<string>();

  for (const operationDayTeam of currentUser.operationDayTeamPilots || []) {
    if (operationDayTeam.teamId) {
      teamIds.add(operationDayTeam.teamId);
    }
  }

  for (const membership of currentUser.operationDayTeamMembers || []) {
    const teamId = membership.operationDayTeam?.teamId;
    if (teamId) {
      teamIds.add(teamId);
    }
  }

  return Array.from(teamIds);
}

async function getLatestTeamOrderVersion(teamIds: string[]) {
  if (teamIds.length === 0) {
    return null;
  }

  const latestOrder = await db.order.findFirst({
    where: {
      operationDayTeam: {
        is: {
          teamId: {
            in: teamIds,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  const latestPinpoint = await db.orderPinpoint.findFirst({
    where: {
      order: {
        operationDayTeam: {
          is: {
            teamId: {
              in: teamIds,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  const orderTs = latestOrder?.updatedAt?.toISOString() || "";
  const pinpointTs = latestPinpoint?.updatedAt?.toISOString() || "";

  return [orderTs, pinpointTs].sort().reverse()[0] || null;
}

export async function GET(_req: NextRequest) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const userTeamIds = getUserTeamIds(currentUser);
  const encoder = new TextEncoder();

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let watcher: ReturnType<typeof setInterval> | null = null;
  let maxLifetime: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;

        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }

        if (watcher) {
          clearInterval(watcher);
          watcher = null;
        }

        if (maxLifetime) {
          clearTimeout(maxLifetime);
          maxLifetime = null;
        }

        try {
          controller.close();
        } catch {}
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;

        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\n` +
                `data: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch (error) {
          console.error("SSE enqueue Fehler /api/orders/stream:", error);
          cleanup();
        }
      };

      try {
        let lastVersion = await getLatestTeamOrderVersion(userTeamIds);

        send("ready", { ok: true, version: lastVersion });
        send("connected", { ok: true });

        heartbeat = setInterval(() => {
          send("ping", { ts: Date.now() });
        }, 15000);

        watcher = setInterval(async () => {
          if (closed) return;

          try {
            const nextVersion = await getLatestTeamOrderVersion(userTeamIds);

            if (nextVersion !== lastVersion) {
              lastVersion = nextVersion;
              send("orders_changed", { version: nextVersion });
            }
          } catch (error) {
            console.error("SSE watcher Fehler /api/orders/stream:", error);
            send("error", { message: "Stream-Fehler" });
          }
        }, 3000);

        maxLifetime = setTimeout(() => {
          cleanup();
        }, 1000 * 60 * 10);
      } catch (error) {
        console.error("SSE start Fehler /api/orders/stream:", error);
        cleanup();
      }
    },

    cancel() {
      closed = true;

      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }

      if (watcher) {
        clearInterval(watcher);
        watcher = null;
      }

      if (maxLifetime) {
        clearTimeout(maxLifetime);
        maxLifetime = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}