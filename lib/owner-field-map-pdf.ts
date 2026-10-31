import { area as turfArea } from "@turf/turf";
import {
  PDFDocument, StandardFonts, rgb,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath,
} from "pdf-lib";
import { db } from "@/lib/db";
import { ownerFieldRings, ownerFieldLabelPosition, type OwnerAreaFeature } from "@/lib/owner-field-map-geometry";

const PAGE_W = 841.89; // A4 quer
const PAGE_H = 595.28;
const ORANGE = rgb(0.95, 0.38, 0.07);
const GREEN = rgb(0.06, 0.38, 0.26);
const DARK = rgb(0.1, 0.16, 0.17);

function printable(value: unknown) {
  // WinAnsi beherrscht deutsche Umlaute. Nur nicht darstellbare Sonderzeichen entfernen.
  return String(value ?? "").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"').replace(/[^\x20-\x7e\u00a0-\u00ff]/g, " ").trim();
}
function truncate(value: string, max: number) {
  const txt = printable(value);
  return txt.length > max ? `${txt.slice(0, max - 3)}...` : txt;
}
const toWorld = (lng: number, lat: number, zoom: number) => {
  const latRad = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  const world = 256 * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * world,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * world,
  };
};

type PdfField = {
  name: string; displayName: string | null; areaGeoJson: unknown;
  locationLatitude: number | null; locationLongitude: number | null;
  locationNote: string | null;
  notes: string | null;
};

async function paintMap(page: ReturnType<PDFDocument["addPage"]>, pdf: PDFDocument,
  fields: PdfField[], x: number, y: number, width: number, height: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  page.drawRectangle({ x, y, width, height, color: rgb(0.91, 0.94, 0.91) });
  const geometry = fields.flatMap((f) => ownerFieldRings(f.areaGeoJson as OwnerAreaFeature));
  const coords = geometry.flat();
  for (const f of fields) {
    if (f.locationLatitude != null && f.locationLongitude != null) coords.push([f.locationLongitude, f.locationLatitude]);
  }
  if (!coords.length) {
    page.drawText("Keine Flächengeometrie vorhanden", { x: x + 18, y: y + height / 2, font, size: 12, color: DARK });
    return;
  }
  const projected = coords.map((p) => toWorld(p[0], p[1], 0));
  const minX = Math.min(...projected.map((p) => p.x));
  const maxX = Math.max(...projected.map((p) => p.x));
  const minY = Math.min(...projected.map((p) => p.y));
  const maxY = Math.max(...projected.map((p) => p.y));
  const scale = 0.67; // Hochaufloesendere Sat-Kacheln fuer PDF
  const safeDx = Math.max(maxX - minX, 0.0001);
  const safeDy = Math.max(maxY - minY, 0.0001);
  const zoom = Math.max(2, Math.min(17, Math.floor(Math.log2(Math.min((width * 0.85) / (safeDx * scale), (height * 0.82) / (safeDy * scale))))));
  const mul = 2 ** zoom;
  const cx = (minX + maxX) / 2 * mul;
  const cy = (minY + maxY) / 2 * mul;
  const toPaper = (lng: number, lat: number): [number, number] => {
    const p = toWorld(lng, lat, zoom);
    return [x + width / 2 + (p.x - cx) * scale, y + height / 2 - (p.y - cy) * scale];
  };
  const minTileX = Math.floor((cx - width / (2 * scale)) / 256);
  const maxTileX = Math.floor((cx + width / (2 * scale)) / 256);
  const minTileY = Math.floor((cy - height / (2 * scale)) / 256);
  const maxTileY = Math.floor((cy + height / (2 * scale)) / 256);
  // Die Grenzen verhindern eine unbegrenzte Anzahl Tile-Abrufe.
  const tileCount = (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1);
  let imagesDrawn = 0;
  if (tileCount <= 35) {
    page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
    const jobs: Promise<void>[] = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) for (let ty = minTileY; ty <= maxTileY; ty++) {
      const ix = tx, iy = ty;
      jobs.push((async () => {
        try {
          if (ix < 0 || ix >= 2 ** zoom || iy < 0 || iy >= 2 ** zoom) return;
          const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${iy}/${ix}`;
          const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
          if (!response.ok) return;
          const bytes = new Uint8Array(await response.arrayBuffer());
          const mime = response.headers.get("content-type") || "";
          const tile = mime.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes).catch(async () => pdf.embedPng(bytes));
          const px = x + width / 2 + (ix * 256 - cx) * scale;
          const py = y + height / 2 - ((iy + 1) * 256 - cy) * scale;
          // pdf-lib zeichnet in synchroner Reihenfolge nach erfolgreichem Fetch.
          page.drawImage(tile, { x: px, y: py, width: 256 * scale, height: 256 * scale });
          imagesDrawn++;
        } catch { /* Bei Kartenserver-Ausfall bleiben Umrisse und FL-Nummern verfuegbar. */ }
      })());
    }
    await Promise.all(jobs);
    page.pushOperators(popGraphicsState());
  }
  if (!imagesDrawn) {
    page.drawText("Satellitenbild nicht erreichbar - Feldgrenzen bleiben sichtbar", {
      x: x + 8, y: y + 8, size: 8, font, color: DARK,
    });
  }
  for (const f of fields) {
    const rings = ownerFieldRings(f.areaGeoJson as OwnerAreaFeature);
    for (const ring of rings) {
      const paper = ring.map(([lng, lat]) => toPaper(lng, lat));
      for (let i = 0; i < paper.length; i++) {
        const a = paper[i], b = paper[(i + 1) % paper.length];
        page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, color: ORANGE, thickness: 2.3 });
      }
    }
    const labelPos = ownerFieldLabelPosition(f.areaGeoJson as OwnerAreaFeature);
    if (labelPos && f.displayName) {
      const [lx, ly] = toPaper(labelPos[0], labelPos[1]);
      const txt = truncate(f.displayName, 16);
      const fontSize = 9.5;
      const w = Math.max(29, bold.widthOfTextAtSize(txt, fontSize) + 10);
      page.drawRectangle({ x: lx - w / 2, y: ly - 7, width: w, height: 16, color: rgb(1,1,1), opacity: 0.91, borderColor: ORANGE, borderWidth: 0.7 });
      page.drawText(txt, { x: lx - bold.widthOfTextAtSize(txt, fontSize) / 2, y: ly - 2, font: bold, size: fontSize, color: DARK });
    }
    if (f.locationLatitude != null && f.locationLongitude != null) {
      const [px, py] = toPaper(f.locationLongitude, f.locationLatitude);
      page.drawCircle({ x: px, y: py, size: 5, color: rgb(0.12, 0.74, 0.27), borderWidth: 1.4, borderColor: rgb(0.05, 0.17, 0.10) });
    }
  }
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0.55, 0.60, 0.57), borderWidth: 1 });
  page.drawText("Feldgrenze: Orange    Treffpunkt: Gruen", { x: x + 7, y: y + 8, font: bold, size: 7, color: rgb(1,1,1) });
  page.drawText("Kartengrundlage: Esri World Imagery", { x: x + width - 165, y: y + 8, font: bold, size: 7, color: rgb(1,1,1) });
}

export async function generateOwnerFieldMapPdf(ownerId: string): Promise<{ bytes: Uint8Array; filename: string; name: string; fieldCount: number }> {
  const owner = await db.owner.findUnique({ where: { id: ownerId } });
  if (!owner) throw new Error("Landwirt nicht gefunden.");
  const raw = await db.field.findMany({ where: { ownerId }, orderBy: [{ displayName: "asc" }, { name: "asc" }] });
  if (!raw.length) throw new Error("Für diesen Landwirt sind keine Flächen vorhanden.");
  const fields: PdfField[] = raw.map((f) => ({
    name: f.name, displayName: f.displayName,
    areaGeoJson: f.areaGeoJson,
    locationLatitude: f.locationLatitude, locationLongitude: f.locationLongitude,
    locationNote: f.locationNote, notes: f.notes,
  }));
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || "Landwirt";
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Flächenkarte - ${name}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawText("Rehkitzrettung Hegering Hittfeld - Landwirt-Flaechenkarte", { x: 26, y: 567, font: bold, size: 15, color: GREEN });
  page.drawText(`Landwirt: ${truncate(name, 70)}`, { x: 26, y: 548, font: bold, size: 11, color: DARK });
  page.drawText(`${raw.length} Flaechen  |  ${raw.reduce((sum, f) => { try { return sum + turfArea(f.areaGeoJson as unknown as GeoJSON.GeoJSON) / 10000; } catch { return sum; } }, 0).toFixed(2).replace(".", ",")} ha`, { x: 26, y: 533, font, size: 9, color: DARK });
  page.drawText(`Erstellt: ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`, { x: 708, y: 548, font, size: 9, color: DARK });
  await paintMap(page, pdf, fields, 26, 169, PAGE_W - 52, 350, font, bold);
  page.drawText("Flaechenuebersicht (FL-Nummer = Beschriftung in der Karte)", { x: 28, y: 154, font: bold, size: 10, color: DARK });
  const drawRow = (pg: typeof page, field: PdfField, y: number) => {
    const sizeHa = (() => { try { return (turfArea(field.areaGeoJson as GeoJSON.GeoJSON) / 10000).toFixed(2).replace(".", ","); } catch { return "-"; } })();
    pg.drawText(truncate(field.displayName || "ohne FL", 15), { x: 29, y, font: bold, size: 9, color: DARK });
    pg.drawText(truncate(field.name, 36), { x: 136, y, font, size: 9, color: DARK });
    pg.drawText(`${sizeHa} ha`, { x: 380, y, font, size: 9, color: DARK });
    pg.drawText(truncate(field.locationNote || (field.locationLatitude != null ? "gesetzt" : "fehlt"), 29), { x: 472, y, font, size: 9, color: DARK });
    pg.drawText(truncate(field.notes || "-", 32), { x: 640, y, font, size: 9, color: DARK });
    pg.drawLine({ start: { x: 28, y: y - 5 }, end: { x: PAGE_W - 28, y: y - 5 }, thickness: 0.4, color: rgb(0.77, 0.79, 0.79) });
  };
  const drawHeader = (pg: typeof page, y: number) => {
    pg.drawText("FL", { x: 29, y, font: bold, size: 8, color: GREEN });
    pg.drawText("Flaechenname", { x: 136, y, font: bold, size: 8, color: GREEN });
    pg.drawText("Groesse", { x: 380, y, font: bold, size: 8, color: GREEN });
    pg.drawText("Treffpunkt", { x: 472, y, font: bold, size: 8, color: GREEN });
    pg.drawText("Notiz", { x: 640, y, font: bold, size: 8, color: GREEN });
  };
  let index = 0;
  drawHeader(page, 140);
  for (let row = 0; row < 5 && index < fields.length; row++, index++) drawRow(page, fields[index], 123 - row * 19);
  while (index < fields.length) {
    const extra = pdf.addPage([PAGE_W, PAGE_H]);
    extra.drawText(`Weitere Flaechen - ${truncate(name, 65)}`, { x: 27, y: 557, font: bold, size: 14, color: GREEN });
    drawHeader(extra, 540);
    for (let row = 0; row < 24 && index < fields.length; row++, index++) drawRow(extra, fields[index], 523 - row * 20);
  }
  const fileSafe = name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "Landwirt";
  return { bytes: await pdf.save(), name, fieldCount: raw.length, filename: `Flaechenkarte-${fileSafe}.pdf` };
}
