import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function POST() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const demoOrders = await db.order.findMany({
      where: {
        isDemo: true,
      },
      select: {
        id: true,
        ownerId: true,
        fieldId: true,
      },
    });

    const orderIds = demoOrders.map((order) => order.id);
    const ownerIds = [...new Set(demoOrders.map((order) => order.ownerId))];
    const fieldIds = [...new Set(demoOrders.map((order) => order.fieldId))];

    if (orderIds.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "Keine Demo-Aufträge gefunden.",
      });
    }

    await db.$transaction(async (tx) => {
      await tx.orderPinpoint.deleteMany({
        where: {
          orderId: {
            in: orderIds,
          },
        },
      });

      await tx.order.deleteMany({
        where: {
          id: {
            in: orderIds,
          },
        },
      });

      for (const fieldId of fieldIds) {
        const remainingOrders = await tx.order.count({
          where: {
            fieldId,
          },
        });

        if (remainingOrders === 0) {
          await tx.field.delete({
            where: {
              id: fieldId,
            },
          });
        }
      }

      for (const ownerId of ownerIds) {
        const remainingOrders = await tx.order.count({
          where: {
            ownerId,
          },
        });

        const remainingFields = await tx.field.count({
          where: {
            ownerId,
          },
        });

        if (remainingOrders === 0 && remainingFields === 0) {
          await tx.owner.delete({
            where: {
              id: ownerId,
            },
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      deleted: orderIds.length,
    });
  } catch (error: any) {
    console.error("Demo-Aufträge löschen Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Demo-Aufträge konnten nicht gelöscht werden.",
      },
      { status: 500 }
    );
  }
}