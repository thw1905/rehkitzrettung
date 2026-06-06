export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function sanitizeFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension);

  const cleanBaseName =
    baseName
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "screenshot";

  return `${cleanBaseName}${extension}`;
}

function getAllowedExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return null;
  }

  return extension;
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen." },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "Die Datei ist leer." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Die Datei ist zu groß. Maximal erlaubt sind 8 MB." },
        { status: 400 }
      );
    }

    const extension = getAllowedExtension(file.name);

    if (!extension) {
      return NextResponse.json(
        { error: "Nur PNG, JPG, JPEG oder WEBP sind erlaubt." },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(file.name);
    const uniquePrefix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const finalFileName = `${uniquePrefix}-${safeName}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", "help");
    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await writeFile(path.join(uploadDir, finalFileName), buffer);

    const url = `/uploads/help/${finalFileName}`;
    const markdown = `![${safeName.replace(extension, "")}](${url})`;

    return NextResponse.json({
      success: true,
      url,
      markdown,
      fileName: finalFileName,
      size: file.size,
    });
  } catch (error: any) {
    console.error("Hilfe-Bild Upload Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Bild konnte nicht hochgeladen werden." },
      { status: 500 }
    );
  }
}