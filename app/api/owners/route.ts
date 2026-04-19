import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const owners = await db.owner.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json(owners);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const owner = await db.owner.create({
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      street: body.street,
      zip: body.zip,
      city: body.city,
      phone: body.phone,
      email: body.email || null,
    },
  });

  return NextResponse.json(owner, { status: 201 });
}