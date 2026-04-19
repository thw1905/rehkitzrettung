import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function GET() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const helpers = await db.user.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        street: true,
        zip: true,
        city: true,
        phone: true,
        email: true,
        role: true,
        isAdmin: true,
        isApproved: true,
        createdAt: true,

        // neu
        autoAssignPriority: true,
        isPrimaryPilot: true,
      },
    });

    return NextResponse.json(helpers);
  } catch (error: any) {
    console.error("Fehler beim Laden der Helfer:", error);

    return NextResponse.json(
      { error: error?.message || "Helfer konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}