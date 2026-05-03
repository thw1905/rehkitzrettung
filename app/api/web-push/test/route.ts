import { NextResponse } from "next/server";
import webpush from "web-push";
import { db } from "@/lib/db";

webpush.setVapidDetails(
  process.env.WEB_PUSH_SUBJECT!,
  process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY!,
  process.env.WEB_PUSH_PRIVATE_KEY!
);

export async function GET() {
  try {
    const subs = await db.webPushSubscription.findMany({
      where: { isActive: true },
    });

    for (const sub of subs) {
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
            title: "🚨 Test Push",
            body: "Push funktioniert!",
            url: "/dashboard",
          })
        );
      } catch (err) {
        console.error("Push Fehler:", err);
      }
    }

    return NextResponse.json({ success: true, count: subs.length });
  } catch (error) {
    return NextResponse.json({ error: "Fehler" }, { status: 500 });
  }
}
