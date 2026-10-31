// REHKITZ_DJI_DOWNLOAD_DIAG_V1_3: Admin-only end-to-end Cloud-Wayline-Test.
// No flight control, no token disclosure, no modification of stored missions.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { listWaylines, findWayline, readWaylineKmz, publicOrigin, signedUrl } from "@/lib/flight-missions/cloud-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user?.isApproved || !user.isAdmin) {
    return NextResponse.json({ error: "Nur Administratoren." }, { status: 403 });
  }
  const report: Record<string, unknown> = { test: "DJI-Cloud-Dateidownload", time: new Date().toISOString() };
  try {
    const all = await listWaylines();
    report.missionenGesamt = all.length;
    const id = req.nextUrl.searchParams.get("id");
    const mission = id ? await findWayline(id) : all[0];
    if (!mission) return NextResponse.json({ ...report, phase: "Speicher", error: "Keine veröffentlichte Mission vorhanden." }, { status: 404 });
    report.missionId = mission.id;
    report.mission = mission.name;
    report.drohne = mission.aircraft;
    report.workspaceHinterlegt = Boolean(mission.workspaceId);

    let local: Buffer;
    try { local = await readWaylineKmz(mission.id); }
    catch { return NextResponse.json({ ...report, phase: "Speicher", error: "KMZ-Datei nicht auf dem Server vorhanden." }, { status: 404 }); }
    report.dateiBytes = local.length;
    report.pruefsummeStimmt = createHash("md5").update(local).digest("hex") === mission.sign;
    if (local.length < 500 || !(report.pruefsummeStimmt)) {
      return NextResponse.json({ ...report, phase: "Speicher", error: "KMZ-Datei fehlt, zu klein oder MD5-Prüfsumme falsch." });
    }
    try {
      const zip = await JSZip.loadAsync(local);
      const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
      report.zipDateien = names;
      const a = zip.file("wpmz/template.kml");
      const b = zip.file("wpmz/waylines.wpml");
      if (!a || !b) throw new Error("template.kml oder waylines.wpml fehlt");
      const xml = await b.async("string");
      report.wegpunkteInKmz = (xml.match(/<Placemark>/g) || []).length;
      if (!xml.includes("<wpml:waylineId>")) throw new Error("waylineId fehlt");
    } catch (e) {
      return NextResponse.json({ ...report, phase: "KMZ", error: e instanceof Error ? e.message : "KMZ nicht lesbar" });
    }
    let url: string;
    try { url = signedUrl(mission.id, publicOrigin(req.url)); }
    catch (e) {
      return NextResponse.json({ ...report, phase: "Download-Adresse", error: e instanceof Error ? e.message : "Signierung fehlgeschlagen" });
    }
    const parsed = new URL(url);
    report.downloadHost = parsed.host;
    report.downloadHttps = parsed.protocol === "https:";
    // The signed query parameters are deliberately never logged or sent to the browser.
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(12000) });
      report.downloadHttpStatus = response.status;
      report.downloadInhaltstyp = response.headers.get("content-type");
      if (response.status !== 200) {
        let errorMessage: string | null = null;
        try { const data = await response.json(); errorMessage = String(data?.error || data?.message || "").slice(0, 200); } catch {}
        report.downloadFehler = errorMessage;
        report.ergebnis = "Die öffentliche KMZ-Adresse antwortet nicht mit HTTP 200.";
        return NextResponse.json(report);
      }
      const remote = Buffer.from(await response.arrayBuffer());
      report.heruntergeladenBytes = remote.length;
      report.downloadDateiIdentisch = createHash("sha256").update(remote).digest("hex") === createHash("sha256").update(local).digest("hex");
      report.ergebnis = report.downloadDateiIdentisch ? "Öffentlicher HTTPS-Download OK; falls Pilot 2 weiter scheitert, URL-API-Antwort und WPML-Kompatibilität prüfen." : "Die über HTTPS geladene Datei unterscheidet sich von der gespeicherten KMZ.";
    } catch (e) {
      report.phase = "Öffentlicher HTTPS-Download";
      report.downloadFehler = e instanceof Error ? e.name : "Netzwerkfehler";
      report.ergebnis = "Der Server kann die eigene öffentliche Download-Adresse nicht abrufen. DNS/TLS/Proxy prüfen.";
    }
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("DJI-Wayline-Download-Diagnose:", e);
    return NextResponse.json({ ...report, phase: "Server", error: "Serverfehler bei der Diagnose; PM2-Logs prüfen." }, { status: 500 });
  }
}
