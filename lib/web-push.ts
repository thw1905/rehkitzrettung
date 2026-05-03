import webpush from "web-push";
import { db } from "@/lib/db";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

function ensureVapidConfigured() {
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT || "mailto:test@test.com",
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || "",
    process.env.WEB_PUSH_PRIVATE_KEY || ""
  );
}

export async function sendWebPushToUser(userId: string, payload: PushPayload) {
  ensureVapidConfigured();

  const subscriptions = await db.webPushSubscription.findMany({
    where: {
      userId,
      isActive: true,
    },
  });

  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload)
      );

      sent++;
    } catch (error) {
      console.error("Push Fehler (User):", error);

      // ungültige Subscription deaktivieren
      await db.webPushSubscription.update({
        where: { id: sub.id },
        data: { isActive: false },
      });
    }
  }

  return sent;
}

export async function sendWebPushToAll(payload: PushPayload) {
  ensureVapidConfigured();

  const subscriptions = await db.webPushSubscription.findMany({
    where: {
      isActive: true,
    },
  });

  let sent = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload)
      );

      sent++;
    } catch (error) {
      console.error("Push Fehler (All):", error);

      await db.webPushSubscription.update({
        where: { id: sub.id },
        data: { isActive: false },
      });
    }
  }

  return sent;
}