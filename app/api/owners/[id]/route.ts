import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json();

  const owner = await db.owner.update({
    where: { id },
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

  return NextResponse.json(owner);
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  await db.owner.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
