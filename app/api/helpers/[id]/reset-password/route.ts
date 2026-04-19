import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();

    const newPassword = String(body?.password || "").trim();

    if (!newPassword) {
      return NextResponse.json(
        { error: "Neues Passwort fehlt." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Das neue Passwort muss mindestens 6 Zeichen lang sein." },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Nutzer nicht gefunden." },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.user.update({
      where: { id },
      data: {
        passwordHash,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fehler beim Zurücksetzen des Passworts:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Passwort konnte nicht zurückgesetzt werden.",
      },
      { status: 500 }
    );
  }
}