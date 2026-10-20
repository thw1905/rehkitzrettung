import { db } from "@/lib/db";
import area from "@turf/area";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import nodemailer from "nodemailer";

// Datumswerte der Einsatztage werden in der bestehenden Datenbank um 00:00 UTC gespeichert.
export function parseFlightDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ungültiges Datum.");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Ungültiges Datum.");
  }
  return parsed;
}

export function germanDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

type Counts = {
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};
export type FlightCertificateArea = {
  orderId: string;
  orderCode: string;
  field: string;
  hectares: number | null;
  started: string | null;
  ended: string | null;
  pilot: string;
  counts: Counts;
};
export type FlightCertificateData = {
  version: 1;
  ownerId: string;
  ownerName: string;
  ownerAddress: string;
  ownerEmail: string | null;
  date: string;
  createdAt: string;
  areas: FlightCertificateArea[];
};
export type FlightGroup = {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  date: string;
  total: number;
  finished: number;
  pending: number;
  eligible: boolean;
};

const zeroCounts = (): Counts => ({
  rehkitzeGesichert: 0, rehkitzeAbgesprungen: 0,
  sonstigesWildGesichert: 0, sonstigesWildAbgesprungen: 0,
  maulwurfhuegelFehlstelle: 0,
});
const countKeys = Object.keys(zeroCounts()) as (keyof Counts)[];
const safeCount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const ownerName = (u: { firstName?: string | null; lastName?: string | null }) =>
  `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Nicht angegeben";
const germanTime = (v: Date | null | undefined): string | null =>
  v ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(v) : null;

// Die Betriebseigenschaft der Fläche hat Vorrang. Fehlt sie, wird der Landwirt
// des Auftrags verwendet. Der separate Kontakt-Ansprechpartner ist KEIN Eigentümer.
export async function getFlightDayGroups(day: string) {
  const dayDate = parseFlightDate(day);
  const tomorrow = new Date(dayDate.getTime() + 86_400_000);
  const orders = await db.order.findMany({
    where: {
      isDemo: false,
      OR: [
        { operationDay: { is: { date: { gte: dayDate, lt: tomorrow } } } },
        { mowingDate: { gte: dayDate, lt: tomorrow } },
      ],
    },
    include: {
      owner: true,
      field: { include: { owner: true } },
      operationDay: { select: { date: true } },
      operationDayTeam: { include: { pilot: true } },
      pinpoints: true,
    },
    orderBy: [{ mowingDate: "asc" }, { createdAt: "asc" }],
  });

  const grouped = new Map<string, { owner: typeof orders[number]["owner"]; orders: typeof orders }>();
  for (const order of orders) {
    // Wenn ein Auftrags-Einsatztag zugeordnet ist, gilt dieser vor dem Mähdatum.
    const effectiveDate = (order.operationDay?.date ?? order.mowingDate)?.toISOString().slice(0, 10);
    if (effectiveDate !== day) continue;
    const farmer = order.field.owner ?? order.owner;
    const group = grouped.get(farmer.id) ?? { owner: farmer, orders: [] };
    group.orders.push(order);
    grouped.set(farmer.id, group);
  }
  return grouped;
}

export async function getFlightGroup(ownerId: string, day: string) {
  const groups = await getFlightDayGroups(day);
  const entry = groups.get(ownerId);
  if (!entry) throw new Error("Für diesen Landwirt gibt es an diesem Einsatztag keine Aufträge.");
  const total = entry.orders.length;
  const finished = entry.orders.filter(order => order.status === "ERLEDIGT").length;
  return { ...entry, total, finished, pending: total - finished };
}

export async function getFlightDayOverview(day: string) {
  const groups = await getFlightDayGroups(day);
  const dayDate = parseFlightDate(day);
  const dispatches = await db.flightCertificateDispatch.findMany({ where: { date: dayDate } });
  const statusByOwner = new Map(dispatches.map(item => [item.ownerId, item]));
  return [...groups.entries()].map(([id, group]) => {
    const total = group.orders.length;
    const finished = group.orders.filter(item => item.status === "ERLEDIGT").length;
    const dispatch = statusByOwner.get(id);
    return {
      ownerId: id,
      ownerName: ownerName(group.owner),
      ownerEmail: group.owner.email || null,
      total, finished, pending: total - finished, eligible: finished === total && total > 0,
      status: dispatch?.status ?? "NOT_SENT",
      sentAt: dispatch?.sentAt?.toISOString() ?? null,
      lastError: dispatch?.lastError ?? null,
      attempts: dispatch?.attempts ?? 0,
    };
  }).sort((a, b) => a.ownerName.localeCompare(b.ownerName, "de"));
}

export async function makeFlightPayload(ownerId: string, day: string): Promise<FlightCertificateData> {
  const group = await getFlightGroup(ownerId, day);
  if (group.pending) throw new Error(`Noch ${group.pending} Fläche(n) nicht abgeschlossen. Kein Nachweis möglich.`);
  const owner = group.owner;
  const areas = group.orders.map(order => {
    const counts = zeroCounts();
    for (const key of countKeys) {
      counts[key] = safeCount(order[key]);
      for (const point of order.pinpoints) counts[key] += safeCount(point[key]);
    }
    let hectares: number | null = order.executedAreaSqm != null ? order.executedAreaSqm / 10_000 : null;
    if (hectares == null) {
      try { hectares = area(order.field.areaGeoJson as any) / 10_000; } catch { /* Fläche unbekannt */ }
    }
    const pilot = order.executedPilotName || (order.operationDayTeam?.pilot ? ownerName(order.operationDayTeam.pilot) : "Nicht dokumentiert");
    return {
      orderId: order.id,
      orderCode: order.orderCode || order.title,
      field: [order.field.displayName, order.field.name].filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i).join(" · ") || order.field.name,
      hectares: hectares != null && Number.isFinite(hectares) ? Math.round(hectares * 100) / 100 : null,
      started: germanTime(order.startTime),
      ended: germanTime(order.endTime),
      pilot,
      counts,
    };
  });
  return {
    version: 1, ownerId, ownerName: ownerName(owner),
    ownerAddress: [owner.street, [owner.zip, owner.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    ownerEmail: owner.email?.trim() || null,
    date: day, createdAt: new Date().toISOString(), areas,
  };
}

// Standard-PDF-Schrift: unbekannte Unicode-Zeichen abfedern (z.B. Emoji aus Namen).
function printable(input: string): string {
  return input.replace(/[^\x20-\x7e\xa0-\xff]/g, (v) => {
    if (v === "\n") return "\n";
    if (v === "\t") return " ";
    return "?";
  });
}
export async function renderFlightPdf(data: FlightCertificateData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 46, contentW = WIDTH - MARGIN * 2;
  const navy = rgb(0.1, 0.2, 0.32), gray = rgb(.36,.39,.44);
  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - 49;
  const newPage = () => {
    page = pdf.addPage([WIDTH,HEIGHT]); y = HEIGHT - 50;
    page.drawText("Befliegungsnachweis · Fortsetzung", {x:MARGIN, y, size:10, font:bold, color:navy}); y -= 32;
  };
  const space = (n: number) => { if (y - n < 57) newPage(); };
  const line = (str: string, size=10, strong=false, color=navy, gap=5) => {
    space(size + 8);
    page.drawText(printable(str), {x:MARGIN, y, font:strong?bold:regular, size, color});
    y -= size + gap;
  };
  const paragraph = (value: string, size=9, strong=false, color=gray, gap=4) => {
    const font = strong?bold:regular;
    const words = printable(value).split(/\s+/).filter(Boolean);
    let buffer = "";
    for (const word of words) {
      const candidate = buffer ? `${buffer} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > contentW && buffer) { line(buffer,size,strong,color,3); buffer=word; }
      else buffer=candidate;
    }
    if (buffer) line(buffer,size,strong,color,gap);
  };
  const rule = () => { space(14); page.drawLine({start:{x:MARGIN,y},end:{x:WIDTH-MARGIN,y},thickness:.7,color:rgb(.79,.83,.87)}); y-=17; };
  line("BEFLIEGUNGSNACHWEIS",19,true,navy,8);
  line("Rehkitzrettung · Dokumentation der durchgeführten Flächenabsuche",9,false,gray,16);
  rule();
  paragraph(`Landwirt / Bewirtschafter: ${data.ownerName}`,10,true,navy,6);
  if (data.ownerAddress) paragraph(`Anschrift: ${data.ownerAddress}`,9);
  line(`Einsatztag: ${germanDate(data.date)}`,10,true,navy,6);
  line(`Erstellt: ${new Date(data.createdAt).toLocaleDateString("de-DE",{timeZone:"Europe/Berlin"})}`,9,false,gray,13);
  rule();
  line(`Abgesuchte Flächen: ${data.areas.length}`,11,true,navy,10);
  for (let i=0; i<data.areas.length; i++) {
    const area = data.areas[i];
    space(120);
    paragraph(`${i+1}. ${area.field}`,11,true,navy,7);
    paragraph(`Auftrag: ${area.orderCode}     Fläche: ${area.hectares != null ? area.hectares.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) + " ha" : "nicht hinterlegt"}`,9);
    paragraph(`Absuche: ${germanDate(data.date)}${area.started ? " · Beginn: " + area.started + " Uhr" : ""}${area.ended ? " · Ende: " + area.ended + " Uhr" : ""}`,9);
    paragraph(`Verantwortlicher Pilot: ${area.pilot}`,9);
    const c=area.counts;
    const wild = c.rehkitzeGesichert + c.rehkitzeAbgesprungen + c.sonstigesWildGesichert + c.sonstigesWildAbgesprungen;
    if (!wild) paragraph("Wildfund: Kein Wildfund dokumentiert.",9,true,navy);
    else paragraph(`Wildfunde: Kitze gesichert ${c.rehkitzeGesichert}, Kitze abgesprungen ${c.rehkitzeAbgesprungen}, sonstiges Wild gesichert ${c.sonstigesWildGesichert}, sonstiges Wild abgesprungen ${c.sonstigesWildAbgesprungen}.`,9,true,navy);
    if (c.maulwurfhuegelFehlstelle) paragraph(`Maulwurfhügel / Fehlstellen: ${c.maulwurfhuegelFehlstelle}`,9);
    y -= 6;
    rule();
  }
  space(90);
  paragraph("BESTÄTIGUNG",10,true,navy);
  paragraph("Die genannten Flächen wurden zu den dokumentierten Zeiten im Rahmen der Rehkitzrettung abgesucht. Die Angaben zu Wildfunden beruhen auf den im Einsatz erfassten Meldungen.",9);
  paragraph("Die Flächenabsuche bietet keine Garantie, dass sich keine Wildtiere auf der Fläche befinden. Vor und während der Mahd sind weiterhin erforderliche Schutz- und Vorsichtsmaßnahmen zu beachten.",8,false,gray);
  const pages = pdf.getPages();
  pages.forEach((p,index) => {
    p.drawText(`Rehkitzrettung · Befliegungsnachweis · ${germanDate(data.date)}`, {x:MARGIN,y:30,size:8,font:regular,color:gray});
    p.drawText(`${index+1}/${pages.length}`, {x:WIDTH-MARGIN-25,y:30,size:8,font:regular,color:gray});
  });
  return Buffer.from(await pdf.save());
}

function safeFilenameName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0,45);
}
export function flightFilename(data: FlightCertificateData) {
  return `Befliegungsnachweis_${data.date}_${safeFilenameName(data.ownerName)}.pdf`;
}

async function sendCertificateMail(to: string, payload: FlightCertificateData, buffer: Buffer) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !user || !pass || !from) throw new Error("SMTP-Konfiguration unvollständig (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM).");
  const port = Number(process.env.SMTP_PORT || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT ungültig.");
  const transport = nodemailer.createTransport({
    host, port, secure: port===465, auth:{user,pass},
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  const result = await transport.sendMail({
    from, to,
    subject: `Befliegungsnachweis Rehkitzrettung vom ${germanDate(payload.date)}`,
    text: [
      `Guten Tag ${payload.ownerName},`,"",
      `anbei erhalten Sie den Befliegungsnachweis über die am ${germanDate(payload.date)} durchgeführte Flächenabsuche.`,
      "Der Nachweis dokumentiert die abgesuchten Flächen, die verantwortlichen Piloten und die erfassten Wildfunde.",
      "","Der Nachweis ist keine Garantie für Wildfreiheit. Bitte beachten Sie weiterhin die erforderlichen Schutzmaßnahmen bei der Mahd.",
      "","Mit freundlichen Grüßen","Rehkitzrettung",
    ].join("\n"),
    attachments:[{filename:flightFilename(payload),content:buffer,contentType:"application/pdf"}],
  });
  // Bei der SMTP-Annahme sollte der Empfänger auf der Accepted-Liste stehen.
  if (!result.accepted.some(a => (typeof a === "string" ? a : a.address).trim().toLowerCase() === to.trim().toLowerCase())) throw new Error("SMTP hat die Empfängeradresse nicht angenommen.");
}

// Auto: nur erster Versuch. ERROR/SENDING werden NIEMALS automatisch neu
// gesendet, weil nach SMTP-Annahme ein Prozessabbruch einen unklaren Status
// hinterlassen kann. Admin muss einen bewussten erneuten Versand auslösen.
export async function sendFlightCertificate(ownerId: string, day: string, manual=false, force=false) {
  const date = parseFlightDate(day);
  const existing = await db.flightCertificateDispatch.findUnique({where:{ownerId_date:{ownerId,date}}});
  if (existing?.status === "SENT") return {status:"SENT",alreadySent:true};
  const payload = await makeFlightPayload(ownerId,day);
  if (!payload.ownerEmail) throw new Error("Beim Landwirt ist keine E-Mail-Adresse hinterlegt.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.ownerEmail)) throw new Error("Ungültige E-Mail-Adresse des Landwirts.");

  if (existing?.status === "SENDING") {
    // Das beweist NICHT, dass die Mail fehlgeschlagen ist. Keine unbewusste Wiederholung.
    if (!manual || !force || Date.now()-existing.updatedAt.getTime() < 10*60_000) {
      return {status:"SENDING",alreadySent:false};
    }
  }
  if (existing?.status === "ERROR" && !manual) return {status:"ERROR",alreadySent:false};

  let dispatchId: string;
  if (!existing) {
    try {
      const item = await db.flightCertificateDispatch.create({
        data: {ownerId,date,status:"SENDING",payload: payload as any,attempts:1},
      });
      dispatchId = item.id;
    } catch (e: any) {
      if (e?.code === "P2002") return {status:"SENDING",alreadySent:false};
      throw e;
    }
  } else {
    const changed = await db.flightCertificateDispatch.updateMany({
      where:{id:existing.id,status:existing.status,updatedAt:existing.updatedAt},
      data:{status:"SENDING",payload:payload as any,lastError:null,attempts:{increment:1}},
    });
    if (changed.count !== 1) return {status:"SENDING",alreadySent:false};
    dispatchId = existing.id;
  }
  try {
    const pdf = await renderFlightPdf(payload);
    await sendCertificateMail(payload.ownerEmail,payload,pdf);
    await db.flightCertificateDispatch.update({where:{id:dispatchId},data:{status:"SENT",sentAt:new Date(),lastError:null}});
    return {status:"SENT",alreadySent:false};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Befliegungsnachweis-Versand:", message);
    await db.flightCertificateDispatch.updateMany({where:{id:dispatchId,status:"SENDING"},data:{status:"ERROR",lastError:message.slice(0,1000)}});
    return {status:"ERROR",alreadySent:false,error:message};
  }
}

export async function maybeSendFlightAfterOrderCompleted(orderId: string) {
  if (process.env.FLIGHT_CERTIFICATE_AUTO_SEND === "false") return;
  const order = await db.order.findUnique({
    where:{id:orderId},
    include:{field:true,operationDay:{select:{date:true}}},
  });
  if (!order || order.isDemo || order.status!=="ERLEDIGT") return;
  const date = (order.operationDay?.date ?? order.mowingDate)?.toISOString().slice(0,10);
  if (!date) return;
  const ownerId = order.field.ownerId ?? order.ownerId;
  const group = await getFlightGroup(ownerId,date);
  if (group.total===0 || group.pending>0) return;
  // Wenn der Landwirt noch keine Mailadresse hat, bleibt der Nachweis in der
  // Verwaltungsansicht als druckbares PDF verfuegbar. Kein Versandversuch.
  if (!group.owner.email?.trim()) return;
  const result = await sendFlightCertificate(ownerId,date);
  if (result.status==="ERROR") console.error("Automatischer Befliegungsnachweis:",result.error);
}

export function isFlightCertificateData(value: unknown): value is FlightCertificateData {
  if (!value || typeof value!=="object") return false;
  const v=value as Partial<FlightCertificateData>;
  return v.version===1 && typeof v.ownerId==="string" && typeof v.date==="string" && Array.isArray(v.areas);
}
