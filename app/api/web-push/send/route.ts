export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sendWebPushToAll } from "@/lib/web-push";

export async function GET() {
  const sent = await sendWebPushToAll({
    title: "🚨 Einsatz!",
    body: "Neuer Auftrag eingegangen",
    url: "/dashboard",
  });

  return NextResponse.json({
    success: true,
    sent,
  });
}