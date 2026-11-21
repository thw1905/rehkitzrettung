import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import {
  deleteTestWaylinesForDays,
  listTestWaylinesForDays,
} from '@/lib/flight-missions/cloud-store';
import { deleteTestPreparationFiles } from '@/lib/flight-missions/team-aircraft-v36';

/** Nur explizit als TEST gekennzeichnete Einsatztage sind loeschbar. */
export type TestCleanupSelection =
  | { scope: 'single'; dayId: string }
  | { scope: 'all' };

type CleanupDb = Pick<typeof db,
  | 'operationDay' | 'operationDayTeam' | 'operationDayTeamMember'
  | 'order' | 'orderPinpoint' | 'pinpointCorrection'
  | 'directFindingsCorrection' | 'orderRevier'
  | 'availability' | 'dailyTeamLocation'
  | 'djiPilotSession' | 'djiMapElement' | 'djiBatteryUsage'
  | 'djiFlightAreaTime' | 'securedWildLocation'
  | 'flightCertificateDispatch' | 'revierSearchReportDispatch'
>;

type Day = { id: string; date: Date; updatedAt: Date };
type Counts = {
  days: number; teams: number; teamMembers: number;
  orders: number; pinpoints: number; findingsCorrections: number;
  availability: number; locations: number;
  pilotSessions: number; mapElements: number;
  batteryUsage: number; flightTimes: number; securedWild: number;
  cloudMissions: number;
  protectedMailRecords: number;
};

export type TestCleanupPreview = {
  days: { id: string; date: string }[];
  counts: Counts;
  warnings: string[];
  fingerprint: string;
};

type CleanupPlan = {
  preview: TestCleanupPreview;
  dayIds: string[];
  dates: Date[];
  teamIds: string[];
  orderIds: string[];
  pinpointIds: string[];
  usageIds: string[];
};

function dayStartPlusOne(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function checksum(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function buildPlan(
  client: CleanupDb,
  selection: TestCleanupSelection,
  cloudMissionIds: string[],
): Promise<CleanupPlan> {
  const days: Day[] = await client.operationDay.findMany({
    where: selection.scope === 'single'
      ? { id: selection.dayId, isTest: true }
      : { isTest: true },
    select: { id: true, date: true, updatedAt: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  if (!days.length) throw new Error('Keine passenden TEST-Einsatztage vorhanden.');
  if (days.length > 1200) throw new Error('Zu viele TEST-Einsatztage für einen Löschvorgang.');

  const dayIds = days.map(x => x.id);
  const dates = days.map(x => x.date);
  const teams = await client.operationDayTeam.findMany({
    where: { operationDayId: { in: dayIds } }, select: { id: true },
  });
  const teamIds = teams.map(x => x.id);
  const orders = await client.order.findMany({
    where: { OR: [
      { operationDayId: { in: dayIds } },
      { operationDayTeamId: { in: teamIds } },
    ] },
    select: { id: true, operationDayId: true, operationDayTeamId: true },
  });
  // Gemischte Verknuepfungen sind ein Datenfehler. Niemals echte Team-/Tages-
  // Zuordnungen stillschweigend mit einem TEST-Tag entfernen.
  if (orders.some(o =>
    (o.operationDayId && !dayIds.includes(o.operationDayId)) ||
    (o.operationDayTeamId && !teamIds.includes(o.operationDayTeamId)))) {
    throw new Error('TEST-Aufträge besitzen widersprüchliche Verknüpfungen zu einem anderen Einsatztag oder Team. Nichts gelöscht.');
  }
  const orderIds = orders.map(x => x.id);
  const points = await client.orderPinpoint.findMany({
    where: { orderId: { in: orderIds } }, select: { id: true },
  });
  const pinpointIds = points.map(x => x.id);
  const usages = await client.djiBatteryUsage.findMany({
    where: { OR: [
      { operationDayId: { in: dayIds } },
      { orderId: { in: orderIds } },
    ] }, select: { id: true, operationDayId: true, orderId: true },
  });
  if (usages.some(u =>
    (u.operationDayId && !dayIds.includes(u.operationDayId)) ||
    (u.orderId && !orderIds.includes(u.orderId)))) {
    throw new Error('DJI-Akkudaten sind mit echten und TEST-Einsätzen gemischt. Nichts gelöscht.');
  }
  const usageIds = usages.map(x => x.id);

  const [linkedMap, linkedWild, linkedFlightTimes] = await Promise.all([
    client.djiMapElement.findMany({
      where: { orderId: { in: orderIds } }, select: { pinpointId: true },
    }),
    client.securedWildLocation.findMany({
      where: { orderId: { in: orderIds } }, select: { pinpointId: true },
    }),
    client.djiFlightAreaTime.findMany({
      where: { orderId: { in: orderIds } }, select: { flightUsageId: true },
    }),
  ]);
  if (linkedMap.some(x => x.pinpointId && !pinpointIds.includes(x.pinpointId)) ||
      linkedWild.some(x => !pinpointIds.includes(x.pinpointId)) ||
      linkedFlightTimes.some(x => !usageIds.includes(x.flightUsageId))) {
    throw new Error('DJI- oder Wilddaten verweisen auf andere, nicht eindeutig zugeordnete Einsätze. Nichts gelöscht.');
  }

  // Verfuegbarkeit und GPS-Standort sind nur durch das Datum verbunden.
  // Wenn am selben Datum ein NICHT zugeordneter Auftrag liegt, wird die
  // Loeschung ganz verweigert: die Daten koennten produktiv sein.
  const otherOrders = await client.order.count({
    where: {
      id: { notIn: orderIds },
      OR: days.flatMap(x => [
        { mowingDate: { gte: x.date, lt: dayStartPlusOne(x.date) } },
        { executionDate: { gte: x.date, lt: dayStartPlusOne(x.date) } },
      ]),
    },
  });
  if (otherOrders > 0) {
    throw new Error(
      'Zu mindestens einem TEST-Datum existieren weitere, nicht eindeutig zugeordnete Aufträge. ' +
      'Aus Sicherheitsgründen wird nichts gelöscht. Bitte die Auftragszuordnung prüfen.',
    );
  }

  const [members, corrections, availability, locations, pilotSessions, mapElements,
    flightTimes, securedWild, protectedCertificates, protectedReports] = await Promise.all([
    client.operationDayTeamMember.count({ where: { operationDayTeamId: { in: teamIds } } }),
    Promise.all([
      client.pinpointCorrection.count({ where: { pinpointId: { in: pinpointIds } } }),
      client.directFindingsCorrection.count({ where: { orderId: { in: orderIds } } }),
    ]).then(x => x[0] + x[1]),
    client.availability.count({ where: { date: { in: dates } } }),
    client.dailyTeamLocation.count({ where: { date: { in: dates } } }),
    client.djiPilotSession.count({ where: { orderId: { in: orderIds } } }),
    client.djiMapElement.count({ where: { OR: [
      { orderId: { in: orderIds } },
      { pinpointId: { in: pinpointIds } },
    ] } }),
    client.djiFlightAreaTime.count({ where: { OR: [
      { flightUsageId: { in: usageIds } },
      { orderId: { in: orderIds } },
    ] } }),
    client.securedWildLocation.count({ where: { OR: [
      { orderId: { in: orderIds } },
      { pinpointId: { in: pinpointIds } },
    ] } }),
    client.flightCertificateDispatch.count({ where: { date: { in: dates } } }),
    client.revierSearchReportDispatch.count({ where: { date: { in: dates } } }),
  ]);

  const counts: Counts = {
    days: days.length, teams: teamIds.length, teamMembers: members,
    orders: orderIds.length, pinpoints: pinpointIds.length,
    findingsCorrections: corrections, availability, locations,
    pilotSessions, mapElements, batteryUsage: usageIds.length,
    flightTimes, securedWild, cloudMissions: cloudMissionIds.length,
    protectedMailRecords: protectedCertificates + protectedReports,
  };
  const warnings = [
    'Nur eindeutig zugeordnete TEST-Daten werden gelöscht. Flächen, Besitzer, Helfer und Drohnen bleiben erhalten.',
    'Ältere Cloud-Missionen ohne eindeutige TEST-Tag-Kennung bleiben zu ihrem Schutz erhalten.',
    'Allgemeine Nachrichten und Versandnachweise bleiben erhalten, da sie keine eindeutige TEST-Tag-Kennung besitzen.',
  ];
  if (counts.protectedMailRecords) warnings.push(
    `${counts.protectedMailRecords} Versandprotokoll(e) bleiben als Nachweis erhalten.`,
  );
  const visibleDays = days.map(x => ({ id: x.id, date: x.date.toISOString().slice(0, 10) }));
  const fingerprint = checksum({
    days: days.map(x => [x.id, x.date.toISOString(), x.updatedAt.toISOString()]),
    counts, teamIds: [...teamIds].sort(), orderIds: [...orderIds].sort(),
    pinpointIds: [...pinpointIds].sort(), usageIds: [...usageIds].sort(),
    cloudMissionIds: [...cloudMissionIds].sort(),
  });
  return { preview: { days: visibleDays, counts, warnings, fingerprint },
    dayIds, dates, teamIds, orderIds, pinpointIds, usageIds };
}

export async function previewTestCleanup(selection: TestCleanupSelection): Promise<TestCleanupPreview> {
  const days = await db.operationDay.findMany({
    where: selection.scope === 'single' ? { id: selection.dayId, isTest: true } : { isTest: true },
    select: { id: true },
  });
  const missions = await listTestWaylinesForDays(days.map(x => x.id));
  return (await buildPlan(db, selection, missions.map(m => m.id))).preview;
}

export class TestCleanupChangedError extends Error {
  constructor() { super('Die TEST-Daten wurden seit der Vorschau verändert. Bitte Vorschau neu laden.'); }
}

export async function deleteTestCleanup(selection: TestCleanupSelection, fingerprint: string) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new TestCleanupChangedError();
  const days = await db.operationDay.findMany({
    where: selection.scope === 'single' ? { id: selection.dayId, isTest: true } : { isTest: true },
    select: { id: true },
  });
  const missions = await listTestWaylinesForDays(days.map(x => x.id));
  const cloudIds = missions.map(x => x.id);

  const plan = await db.$transaction(async tx => {
    const now = await buildPlan(tx, selection, cloudIds);
    if (now.preview.fingerprint !== fingerprint) throw new TestCleanupChangedError();
    const { dayIds, dates, teamIds, orderIds, pinpointIds, usageIds } = now;
    await tx.djiFlightAreaTime.deleteMany({ where: { OR: [
      { flightUsageId: { in: usageIds } }, { orderId: { in: orderIds } },
    ] } });
    await tx.djiBatteryUsage.deleteMany({ where: { id: { in: usageIds } } });
    await tx.djiPilotSession.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.djiMapElement.deleteMany({ where: { OR: [
      { orderId: { in: orderIds } }, { pinpointId: { in: pinpointIds } },
    ] } });
    await tx.securedWildLocation.deleteMany({ where: { OR: [
      { orderId: { in: orderIds } }, { pinpointId: { in: pinpointIds } },
    ] } });
    await tx.pinpointCorrection.deleteMany({ where: { pinpointId: { in: pinpointIds } } });
    await tx.directFindingsCorrection.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderRevier.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderPinpoint.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.operationDayTeamMember.deleteMany({ where: { operationDayTeamId: { in: teamIds } } });
    await tx.operationDayTeam.deleteMany({ where: { id: { in: teamIds } } });
    await tx.availability.deleteMany({ where: { date: { in: dates } } });
    await tx.dailyTeamLocation.deleteMany({ where: { date: { in: dates } } });
    const result = await tx.operationDay.deleteMany({ where: { id: { in: dayIds }, isTest: true } });
    if (result.count !== dayIds.length) throw new TestCleanupChangedError();
    return now;
  }, { timeout: 30_000 });

  // DJI-Daten liegen ausserhalb von SQLite. Ein Fehler hier wird explizit
  // gemeldet und niemals als erfolgreicher Komplettabgleich ausgegeben.
  const warnings: string[] = [];
  let deletedCloudMissions = 0;
  try { deletedCloudMissions = await deleteTestWaylinesForDays(plan.dayIds); }
  catch (e) { warnings.push('Cloud-Missionen konnten nicht vollständig entfernt werden: ' +
    (e instanceof Error ? e.message : String(e))); }
  try { await deleteTestPreparationFiles(plan.teamIds, plan.orderIds); }
  catch (e) { warnings.push('Dateien der DJI-Einsatzvorbereitung konnten nicht vollständig entfernt werden: ' +
    (e instanceof Error ? e.message : String(e))); }
  return { success: true, deleted: plan.preview.counts,
    deletedCloudMissions, warnings };
}
