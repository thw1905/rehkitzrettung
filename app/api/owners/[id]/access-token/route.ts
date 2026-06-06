export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function createToken() {
  return randomBytes(24).toString("hex");
}

async function requireAdmin() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      ),
    };
  }

  if (!currentUser.isAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    currentUser,
  };
}

function getBaseUrl(req: NextRequest) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "";

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";

  return `${proto}://${host}`;
}

function buildPublicUrl(req: NextRequest, token: string) {
  return `${getBaseUrl(req)}/landwirt/${token}`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;

    const owner = await db.owner.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        accessTokens: {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Ansprechpartner wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const activeToken = owner.accessTokens[0] || null;

    return NextResponse.json({
      ownerId: owner.id,
      hasActiveToken: Boolean(activeToken),
      token: activeToken?.token || null,
      url: activeToken ? buildPublicUrl(req, activeToken.token) : null,
      createdAt: activeToken?.createdAt || null,
    });
  } catch (error: any) {
    console.error("Landwirt-Link laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Landwirt-Link konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const regenerate = Boolean(body?.regenerate);

    const owner = await db.owner.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Ansprechpartner wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const existing = await db.ownerAccessToken.findFirst({
      where: {
        ownerId: id,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (existing && !regenerate) {
      return NextResponse.json({
        ownerId: id,
        token: existing.token,
        url: buildPublicUrl(req, existing.token),
        createdAt: existing.createdAt,
        reused: true,
      });
    }

    const token = createToken();

    const created = await db.$transaction(async (tx) => {
      if (regenerate) {
        await tx.ownerAccessToken.updateMany({
          where: {
            ownerId: id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }

      return tx.ownerAccessToken.create({
        data: {
          ownerId: id,
          token,
          isActive: true,
        },
      });
    });

    return NextResponse.json({
      ownerId: id,
      token: created.token,
      url: buildPublicUrl(req, created.token),
      createdAt: created.createdAt,
      reused: false,
    });
  } catch (error: any) {
    console.error("Landwirt-Link erzeugen Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Landwirt-Link konnte nicht erzeugt werden." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;

    await db.ownerAccessToken.updateMany({
      where: {
        ownerId: id,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Landwirt-Link deaktivieren Fehler:", error);

    return NextResponse.json(
      {
        error: error?.message || "Landwirt-Link konnte nicht deaktiviert werden.",
      },
      { status: 500 }
    );
  }
}