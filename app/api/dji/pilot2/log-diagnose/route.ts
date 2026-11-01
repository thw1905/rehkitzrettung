// DJI_PILOT_LOG_DIAG_V1: admin+PIN-only, explicit and size-limited log file upload.
// Files remain outside /public and are never served back by an HTTP route.
import { NextRequest, NextResponse } from "next/server";
import { authorizeGpsTestApi } from "@/lib/gps-test-access";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 12 * 1024 * 1024;
const secureHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: NextRequest) {
  const permission = await authorizeGpsTestApi(request);
  if (!permission.ok) {
    return NextResponse.json({ error: permission.message }, { status: permission.status, headers: secureHeaders });
  }
  const lengthHeader = request.headers.get("content-length");
  const declaredLength = lengthHeader ? Number(lengthHeader) : NaN;
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 200_000) {
    return NextResponse.json({ error: "Logdatei ist größer als 12 MB." }, { status: 413, headers: secureHeaders });
  }
  try {
    const form = await request.formData();
    const log = form.get("log");
    if (!(log instanceof File)) {
      return NextResponse.json({ error: "Keine Logdatei ausgewählt." }, { status: 400, headers: secureHeaders });
    }
    if (!log.size || log.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logdatei muss zwischen 1 Byte und 12 MB groß sein." }, { status: 413, headers: secureHeaders });
    }
    const original = log.name || "dji-log.bin";
    const ext = path.extname(original).toLowerCase();
    if (![".log", ".txt", ".zip", ".gz", ".dat", ".bin", ".plog", ".json", ".tar"].includes(ext)) {
      return NextResponse.json({ error: "Nicht unterstützte Logdateiendung." }, { status: 400, headers: secureHeaders });
    }
    const folder = path.join(process.cwd(), ".data", "dji-pilot-logdiagnose");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const storedAs = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}${ext}`;
    await writeFile(path.join(folder, storedAs), Buffer.from(await log.arrayBuffer()), { flag: "wx", mode: 0o600 });
    console.info("[DJI-PILOT-LOGDIAG] Datei gespeichert", storedAs, "Bytes", log.size);
    return NextResponse.json({ ok: true, storedAs, bytes: log.size }, { headers: secureHeaders });
  } catch (err) {
    console.error("[DJI-PILOT-LOGDIAG] Uploadfehler", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Logdatei konnte nicht gespeichert werden." }, { status: 500, headers: secureHeaders });
  }
}
