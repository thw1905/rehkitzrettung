export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { sendMail } from "@/lib/mail";

export async function GET(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const to = req.nextUrl.searchParams.get("to")?.trim();

    if (!to) {
      return NextResponse.json(
        {
          error:
            "Empfänger fehlt. Beispiel: /api/admin/test-mail?to=name@example.de",
        },
        { status: 400 }
      );
    }

    await sendMail({
      to,
      subject: "Testmail Rehkitzrettung",
      text: [
        "Hallo,",
        "",
        "das ist eine Testmail aus der Rehkitzrettung-App.",
        "",
        `Gesendet am: ${new Date().toLocaleString("de-DE")}`,
        "",
        "Wenn diese Mail angekommen ist, funktioniert der E-Mail-Versand.",
      ].join("\n"),
    });

    return NextResponse.json({
      success: true,
      message: `Testmail wurde an ${to} gesendet.`,
    });
  } catch (error: any) {
    console.error("Testmail Fehler:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Testmail konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}