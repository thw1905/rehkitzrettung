import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function PATCH(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await context.params;

    const user = await db.user.update({
      where: { id },
      data: {
        isApproved: true,
      },
      select: {
        id: true,
        isApproved: true,
      },
    });

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Fehler bei Freigabe:", error);

    return NextResponse.json(
      { error: error?.message || "Freigabe fehlgeschlagen." },
      { status: 500 }
    );
  }
}