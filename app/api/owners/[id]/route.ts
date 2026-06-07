import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function PATCH(
  req: NextRequest,
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
  } catch (error: any) {
    console.error("Landwirt speichern Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Landwirt konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const owner = await db.owner.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Landwirt wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const [
      fieldCount,
      orderCount,
      contactOrderCount,
      mowingRequestCount,
      accessTokenCount,
    ] = await Promise.all([
      db.field.count({
        where: {
          ownerId: id,
        },
      }),
      db.order.count({
        where: {
          ownerId: id,
        },
      }),
      db.order.count({
        where: {
          contactOwnerId: id,
        },
      }),
      db.mowingRequest.count({
        where: {
          ownerId: id,
        },
      }),
      db.ownerAccessToken.count({
        where: {
          ownerId: id,
        },
      }),
    ]);

    const blockingReasons: string[] = [];

    if (fieldCount > 0) {
      blockingReasons.push(`${fieldCount} Fläche(n)`);
    }

    if (orderCount > 0) {
      blockingReasons.push(`${orderCount} Auftrag/Aufträge als Landwirt`);
    }

    if (contactOrderCount > 0) {
      blockingReasons.push(
        `${contactOrderCount} Auftrag/Aufträge als Ansprechpartner`
      );
    }

    if (mowingRequestCount > 0) {
      blockingReasons.push(`${mowingRequestCount} Mähanfrage(n)`);
    }

    if (blockingReasons.length > 0) {
      return NextResponse.json(
        {
          error: `Landwirt kann nicht gelöscht werden, weil noch ${blockingReasons.join(
            ", "
          )} zugeordnet sind.`,
          details: {
            fields: fieldCount,
            orders: orderCount,
            contactOrders: contactOrderCount,
            mowingRequests: mowingRequestCount,
            accessTokens: accessTokenCount,
          },
        },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.ownerAccessToken.deleteMany({
        where: {
          ownerId: id,
        },
      });

      await tx.owner.delete({
        where: {
          id,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Landwirt wurde gelöscht.",
    });
  } catch (error: any) {
    console.error("Landwirt löschen Fehler:", error);

    if (error?.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Landwirt kann nicht gelöscht werden, weil noch Daten mit diesem Eintrag verknüpft sind.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error?.message || "Landwirt konnte nicht gelöscht werden.",
      },
      { status: 500 }
    );
  }
}
