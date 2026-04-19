import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function GET() {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const count = await db.user.count({
      where: {
        isApproved: false,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Fehler beim Laden der offenen Freigaben:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden" },
      { status: 500 }
    );
  }
}