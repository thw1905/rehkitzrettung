/**
 * Automatischer Suchbericht nach Abschluss des letzten Auftrags eines Reviers.
 * Ein Auftrag kann mehreren Revieren zugeordnet sein. Direktfunde gehen zum
 * Hauptrevier (groesste Ueberschneidung); GPS-PinPoints werden pro Auftrag
 * genau EINEM Revier zugeordnet, vorzugsweise nach Position.
 *
 * Bei unklarem SMTP-Zustand KEINE automatische Wiederholung: Das schuetzt
 * vor doppeltem Versand nach einem Prozessabbruch nach SMTP-Annahme.
 */
import { booleanPointInPolygon } from "@turf/turf";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { getRevierSearchReportTemplate } from "@/lib/revier-search-report-template-store";
import { renderRevierSearchReportText, validateRevierSearchReportTemplate } from "@/lib/revier-search-report-template";

const KEYS = [
  "rehkitzeGesichert", "rehkitzeAbgesprungen",
  "sonstigesWildGesichert", "sonstigesWildAbgesprungen",
] as const;
type Key = typeof KEYS[number];
type Counts = Record<Key, number>;
const zero = (): Counts => ({
  rehkitzeGesichert: 0,
  rehkitzeAbgesprungen: 0,
  sonstigesWildGesichert: 0,
  sonstigesWildAbgesprungen: 0,
});
const num = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
function add(target: Counts, source: Partial<Record<Key, number | null>>) {
  for (const key of KEYS) target[key] += num(source[key]);
}
function hasWild(value: Counts) { return KEYS.some(key => value[key] > 0); }
function formatCounts(n: Counts) {
  return [
    `Rehkitze gesichert: ${n.rehkitzeGesichert}`,
    `Rehkitze abgesprungen: ${n.rehkitzeAbgesprungen}`,
    `Sonstiges Wild gesichert: ${n.sonstigesWildGesichert}`,
    `Sonstiges Wild abgesprungen: ${n.sonstigesWildAbgesprungen}`,
  ].join("\n");
}
function summary(n: Counts) {
  if (!hasWild(n)) return "Keine Wildfunde dokumentiert.";
  return `Rehkitze gesichert ${n.rehkitzeGesichert}, abgesprungen ${n.rehkitzeAbgesprungen}; ` +
    `sonstiges Wild gesichert ${n.sonstigesWildGesichert}, abgesprungen ${n.sonstigesWildAbgesprungen}.`;
}
function fieldName(field: { name: string; displayName: string | null }) {
  const a = field.displayName?.trim(), b = field.name?.trim();
  return a && b && a !== b ? `${a} · ${b}` : a || b || "Unbenannte Fläche";
}
const dayKey = (v: Date | null | undefined) => v?.toISOString().slice(0, 10) ?? null;
const deDate = (key: string) => {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
};
const linkToGps = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;

function containsLocation(geo: unknown, lat: number, lon: number): boolean {
  if (!geo || typeof geo !== "object") return false;
  const obj: any = geo;
  try {
    if (obj.type === "FeatureCollection") {
      return Array.isArray(obj.features) && obj.features.some((feature: unknown) => containsLocation(feature, lat, lon));
    }
    const geometry = obj.type === "Feature" ? obj.geometry : obj;
    return (geometry?.type === "Polygon" || geometry?.type === "MultiPolygon") &&
      booleanPointInPolygon([lon, lat], geometry);
  } catch { return false; }
}

/** Hauptrevier entsprechend der bisherigen Statistik: groesste Ueberschneidung. */
function orderedReviere(assignments: Array<{ revierId: string; overlapSqm: number | null }>) {
  return [...assignments].sort((a, b) => num(b.overlapSqm) - num(a.overlapSqm) || a.revierId.localeCompare(b.revierId));
}

export async function maybeSendRevierReportAfterOrderCompleted(orderId: string): Promise<void> {
  // Bewusst explizit freischalten, damit lokale Testauftraege keine echten Mails ausloesen.
  if (process.env.REVIER_SEARCH_REPORT_AUTO_SEND !== "true") return;

  const completed = await db.order.findUnique({
    where: { id: orderId },
    include: {
      operationDay: { select: { date: true } },
      reviere: { select: { revierId: true } },
    },
  });
  if (!completed || completed.isDemo || completed.status !== "ERLEDIGT") return;
  const date = completed.operationDay?.date ?? completed.mowingDate;
  const key = dayKey(date);
  if (!date || !key) return;

  // Dieselbe Regel wie beim Befliegungsnachweis: operationDay hat Vorrang vor mowingDate.
  const start = new Date(`${key}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  for (const revierId of new Set(completed.reviere.map(r => r.revierId))) {
    try {
      await sendRevierReportIfComplete(revierId, key, start, end);
    } catch (error) {
      console.error(`Automatischer Suchbericht (Revier ${revierId}, ${key}):`, error);
    }
  }
}

async function sendRevierReportIfComplete(revierId: string, day: string, start: Date, end: Date) {
  const [revier, candidateOrders] = await Promise.all([
    db.revier.findUnique({
      where: { id: revierId },
      include: { paechter: { include: { pachter: true } } },
    }),
    db.order.findMany({
      where: {
        isDemo: false,
        reviere: { some: { revierId } },
        OR: [
          { operationDay: { is: { date: { gte: start, lt: end } } } },
          { mowingDate: { gte: start, lt: end } },
        ],
      },
      include: {
        operationDay: { select: { date: true } },
        field: { select: { name: true, displayName: true } },
        reviere: { select: { revierId: true, overlapSqm: true } },
        pinpoints: {
          select: {
            latitude: true, longitude: true, sequenceNumber: true,
            status: true, note: true,
            rehkitzeGesichert: true, rehkitzeAbgesprungen: true,
            sonstigesWildGesichert: true, sonstigesWildAbgesprungen: true,
          },
          orderBy: { sequenceNumber: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!revier || !revier.paechter.length) return;

  const orders = candidateOrders.filter(order =>
    dayKey(order.operationDay?.date ?? order.mowingDate) === day
  );
  if (!orders.length || orders.some(o => o.status !== "ERLEDIGT")) return;

  const otherRevierIds = new Set(
    orders.flatMap(order => order.reviere.map(r => r.revierId)).filter(id => id !== revierId)
  );
  const otherReviere = await db.revier.findMany({
    where: { id: { in: [...otherRevierIds] } },
    select: { id: true, areaGeoJson: true },
  });
  const polygons = new Map<string, unknown>([[revierId, revier.areaGeoJson], ...otherReviere.map(r => [r.id, r.areaGeoJson] as const)]);

  const total = zero();
  const fieldLines: string[] = [];
  const gpsLines: string[] = [];
  for (const order of orders) {
    const assignments = orderedReviere(order.reviere);
    const mainId = assignments[0]?.revierId;
    const counts = zero();
    const multiple = assignments.length > 1;
    // Die Direktzahlen sind keine Punkt-Funde: genau einmal zum Hauptrevier.
    if (mainId === revierId) add(counts, order);

    for (const pin of order.pinpoints) {
      // Ohne erledigten PinPoint keine gesicherten Wildzahlen; das ist schon
      // durch die Abschlussvalidierung des Auftrags garantiert.
      const matched = assignments.find(a => containsLocation(polygons.get(a.revierId), pin.latitude, pin.longitude));
      const attributed = matched?.revierId || mainId;
      if (attributed !== revierId) continue;
      add(counts, pin);
      if (!hasWild({
        rehkitzeGesichert: num(pin.rehkitzeGesichert),
        rehkitzeAbgesprungen: num(pin.rehkitzeAbgesprungen),
        sonstigesWildGesichert: num(pin.sonstigesWildGesichert),
        sonstigesWildAbgesprungen: num(pin.sonstigesWildAbgesprungen),
      })) continue;
      const gps = linkToGps(pin.latitude, pin.longitude);
      const locationNotice = multiple && !matched ? " (außerhalb der zugeordneten Reviergrenzen; bitte prüfen)" : "";
      const findings = summary({
        rehkitzeGesichert: num(pin.rehkitzeGesichert),
        rehkitzeAbgesprungen: num(pin.rehkitzeAbgesprungen),
        sonstigesWildGesichert: num(pin.sonstigesWildGesichert),
        sonstigesWildAbgesprungen: num(pin.sonstigesWildAbgesprungen),
      });
      gpsLines.push(`- ${fieldName(order.field)}, PinPoint ${pin.sequenceNumber}: ${findings}${locationNotice}\n  ${gps}`);
    }
    add(total, counts);
    const caution = multiple ? " (revierübergreifende Fläche, Funde nach GPS/Hauptrevier zugeordnet)" : "";
    fieldLines.push(`- ${fieldName(order.field)}${order.orderCode ? ` [${order.orderCode}]` : ""}${caution}: ${summary(counts)}`);
  }

  const template = await getRevierSearchReportTemplate();
  const issue = validateRevierSearchReportTemplate(template.subject, template.body);
  if (issue) throw new Error(`Gespeicherte Suchbericht-Vorlage ist ungültig: ${issue}`);
  const revierLabel = [revier.nummer, revier.name].filter(Boolean).join(" · ");
  const recipients = new Map<string, { id: string; firstName: string; email: string }>();
  for (const assignment of revier.paechter) {
    const person = assignment.pachter;
    const email = person?.email?.trim();
    if (!person || !email) continue;
    // Ein Eintrag je Revierpächter, auch wenn er mehrfach zugeordnet wurde.
    recipients.set(person.id, { id: person.id, firstName: person.firstName || "", email });
  }
  for (const person of recipients.values()) {
    const values = {
      vorname: person.firstName,
      datum: deDate(day),
      revier: revierLabel,
      flaechen: fieldLines.join("\n"),
      wildzahlen: formatCounts(total),
      fundstellen: gpsLines.length ? gpsLines.join("\n") : "Keine GPS-Fundstellen mit Wildfunden dokumentiert.",
    };
    const subject = renderRevierSearchReportText(template.subject, values);
    const body = renderRevierSearchReportText(template.body, values);
    await sendOnce({ revierId, date: start, pachterId: person.id, email: person.email, subject, body });
  }
}

async function sendOnce(payload: {
  revierId: string; date: Date; pachterId: string;
  email: string; subject: string; body: string;
}) {
  let row: { id: string };
  try {
    row = await db.revierSearchReportDispatch.create({
      data: {
        revierId: payload.revierId,
        pachterId: payload.pachterId,
        date: payload.date,
        email: payload.email,
        subject: payload.subject,
        body: payload.body,
        status: "SENDING",
      },
      select: { id: true },
    });
  } catch (error: any) {
    // atomarer Schutz gegen zwei gleichzeitig beendete Auftraege
    if (error?.code === "P2002") return;
    throw error;
  }
  try {
    await sendMail({ to: payload.email, subject: payload.subject, text: payload.body });
    await db.revierSearchReportDispatch.update({
      where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Suchbericht-Mailversand:", message);
    try {
      await db.revierSearchReportDispatch.updateMany({
        where: { id: row.id, status: "SENDING" },
        data: { status: "ERROR", lastError: message.slice(0, 1000) },
      });
    } catch (updateError) {
      console.error("Suchbericht-Versandstatus konnte nicht gespeichert werden:", updateError);
    }
  }
}
