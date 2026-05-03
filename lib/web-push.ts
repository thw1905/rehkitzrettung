import webpush from "web-push";
import { db } from "@/lib/db";

webpush.setVapidDetails(
  process.env.WEB_PUSH_SUBJECT || "mailto:test@test.com",
  process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY!,
  process.env.WEB_PUSH_PRIVATE_KEY!
);

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export async function sendWebPushToUser(userId: string, payload: PushPayload) {
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
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url || "/dashboard",
        })
      );

      sent++;
    } catch (error: any) {
      console.error("WebPush Fehler:", error);

      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.webPushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
      }
    }
  }

  return sent;
}

export async function sendWebPushToAll(payload: PushPayload) {
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
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url || "/dashboard",
        })
      );

      sent++;
    } catch (error: any) {
      console.error("WebPush Fehler:", error);

      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.webPushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
      }
    }
  }

  return sent;
}