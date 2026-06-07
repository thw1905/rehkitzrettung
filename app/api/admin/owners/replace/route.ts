export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

function normalizeBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

async function buildPreview(fromOwnerId: string) {
  const [
    fromOwner,
    ordersAsOwner,
    ordersAsContact,
    fields,
    mowingRequests,
    accessTokens,
  ] = await Promise.all([
    db.owner.findUnique({
      where: { id: fromOwnerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
      },
    }),

    db.order.findMany({
      where: {
        ownerId: fromOwnerId,
      },
      select: {
        id: true,
        orderCode: true,
        title: true,
        status: true,
        mowingDate: true,
        field: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ mowingDate: "desc" }, { createdAt: "desc" }],
    }),

    db.order.findMany({
      where: {
        contactOwnerId: fromOwnerId,
      },
      select: {
        id: true,
        orderCode: true,
        title: true,
        status: true,
        mowingDate: true,
        field: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: [{ mowingDate: "desc" }, { createdAt: "desc" }],
    }),

    db.field.findMany({
      where: {
        ownerId: fromOwnerId,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
      },
      orderBy: [{ displayName: "asc" }, { name: "asc" }],
    }),

    db.mowingRequest.findMany({
      where: {
        ownerId: fromOwnerId,
      },
      select: {
        id: true,
        mowingDate: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ mowingDate: "desc" }, { createdAt: "desc" }],
    }),

    db.ownerAccessToken.findMany({
      where: {
        ownerId: fromOwnerId,
      },
      select: {
        id: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  if (!fromOwner) {
    throw new Error("Falscher Landwirt wurde nicht gefunden.");
  }

  return {
    fromOwner,
    counts: {
      ordersAsOwner: ordersAsOwner.length,
      ordersAsContact: ordersAsContact.length,
      fields: fields.length,
      mowingRequests: mowingRequests.length,
      accessTokens: accessTokens.length,
      activeAccessTokens: accessTokens.filter((token) => token.isActive).length,
    },
    ordersAsOwner,
    ordersAsContact,
    fields,
    mowingRequests,
    accessTokens,
  };
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const body = await req.json();

    const fromOwnerId = String(body.fromOwnerId || "").trim();
    const toOwnerId = String(body.toOwnerId || "").trim();
    const dryRun = normalizeBoolean(body.dryRun, true);

    const replaceOrdersAsOwner = normalizeBoolean(
      body.replaceOrdersAsOwner,
      true
    );
    const replaceOrdersAsContact = normalizeBoolean(
      body.replaceOrdersAsContact,
      true
    );
    const replaceFields = normalizeBoolean(body.replaceFields, true);
    const replaceMowingRequests = normalizeBoolean(
      body.replaceMowingRequests,
      true
    );
    const deactivateOldAccessTokens = normalizeBoolean(
      body.deactivateOldAccessTokens,
      true
    );

    if (!fromOwnerId) {
      return NextResponse.json(
        { error: "Falscher Landwirt fehlt." },
        { status: 400 }
      );
    }

    if (!toOwnerId) {
      return NextResponse.json(
        { error: "Richtiger Landwirt fehlt." },
        { status: 400 }
      );
    }

    if (fromOwnerId === toOwnerId) {
      return NextResponse.json(
        { error: "Falscher und richtiger Landwirt dürfen nicht identisch sein." },
        { status: 400 }
      );
    }

    const [fromOwner, toOwner] = await Promise.all([
      db.owner.findUnique({
        where: { id: fromOwnerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      }),
      db.owner.findUnique({
        where: { id: toOwnerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      }),
    ]);

    if (!fromOwner) {
      return NextResponse.json(
        { error: "Falscher Landwirt wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (!toOwner) {
      return NextResponse.json(
        { error: "Richtiger Landwirt wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const previewBefore = await buildPreview(fromOwnerId);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: "Prüfung abgeschlossen. Es wurde noch nichts geändert.",
        fromOwner,
        toOwner,
        preview: previewBefore,
      });
    }

    const result = await db.$transaction(async (tx) => {
      const updated: {
        ordersAsOwner: number;
        ordersAsContact: number;
        fields: number;
        mowingRequests: number;
        accessTokensDeactivated: number;
      } = {
        ordersAsOwner: 0,
        ordersAsContact: 0,
        fields: 0,
        mowingRequests: 0,
        accessTokensDeactivated: 0,
      };

      if (replaceOrdersAsOwner) {
        const updateResult = await tx.order.updateMany({
          where: {
            ownerId: fromOwnerId,
          },
          data: {
            ownerId: toOwnerId,
          },
        });

        updated.ordersAsOwner = updateResult.count;
      }

      if (replaceOrdersAsContact) {
        const updateResult = await tx.order.updateMany({
          where: {
            contactOwnerId: fromOwnerId,
          },
          data: {
            contactOwnerId: toOwnerId,
          },
        });

        updated.ordersAsContact = updateResult.count;
      }

      if (replaceFields) {
        const updateResult = await tx.field.updateMany({
          where: {
            ownerId: fromOwnerId,
          },
          data: {
            ownerId: toOwnerId,
          },
        });

        updated.fields = updateResult.count;
      }

      if (replaceMowingRequests) {
        const updateResult = await tx.mowingRequest.updateMany({
          where: {
            ownerId: fromOwnerId,
          },
          data: {
            ownerId: toOwnerId,
          },
        });

        updated.mowingRequests = updateResult.count;
      }

      if (deactivateOldAccessTokens) {
        const updateResult = await tx.ownerAccessToken.updateMany({
          where: {
            ownerId: fromOwnerId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        updated.accessTokensDeactivated = updateResult.count;
      }

      return updated;
    });

    const previewAfter = await buildPreview(fromOwnerId);

    return NextResponse.json({
      success: true,
      dryRun: false,
      message: "Landwirt-Zuordnung wurde korrigiert.",
      fromOwner,
      toOwner,
      updated: result,
      remaining: previewAfter.counts,
      previewBefore,
      previewAfter,
    });
  } catch (error: any) {
    console.error("Landwirt-Zuordnung korrigieren Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Landwirt-Zuordnung konnte nicht korrigiert werden.",
      },
      { status: 500 }
    );
  }
}