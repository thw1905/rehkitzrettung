import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const teams = await db.team.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json(teams);
}