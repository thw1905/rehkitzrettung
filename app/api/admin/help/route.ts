export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function requireAdmin() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser || !currentUser.isAdmin) {
    return null;
  }

  return currentUser;
}

async function makeUniqueSlug(title: string) {
  const baseSlug = slugify(title) || "hilfe";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await db.helpArticle.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) return slug;

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

export async function GET() {
  try {
    const currentUser = await requireAdmin();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const articles = await db.helpArticle.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { title: "asc" },
      ],
    });

    return NextResponse.json({ articles });
  } catch (error: any) {
    console.error("Admin Hilfe laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hilfe konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAdmin();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const sortOrder = Number(body.sortOrder || 0);
    const isActive =
      typeof body.isActive === "boolean" ? body.isActive : true;

    if (!title) {
      return NextResponse.json(
        { error: "Titel fehlt." },
        { status: 400 }
      );
    }

    const slug = await makeUniqueSlug(title);

    const article = await db.helpArticle.create({
      data: {
        slug,
        title,
        content,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive,
      },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error: any) {
    console.error("Hilfe-Kapitel anlegen Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Hilfe-Kapitel konnte nicht angelegt werden." },
      { status: 500 }
    );
  }
}