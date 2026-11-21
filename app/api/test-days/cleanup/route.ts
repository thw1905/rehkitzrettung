export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithTeams } from '@/lib/current-user';
import { verifyTestDayPin } from '@/lib/test-mode';
import {
  deleteTestCleanup,
  previewTestCleanup,
  TestCleanupChangedError,
  type TestCleanupSelection,
} from '@/lib/test-day-cleanup';

const noStore = { 'Cache-Control': 'no-store' };
const failures = new Map<string, { count: number; until: number }>();

function selection(scope: unknown, dayId: unknown): TestCleanupSelection | null {
  if (scope === 'all') return { scope: 'all' };
  if (scope === 'single' && typeof dayId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(dayId)) {
    return { scope: 'single', dayId };
  }
  return null;
}

function validOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    if (process.env.NODE_ENV === 'production') {
      const expected = process.env.NEXTAUTH_URL
        ? new URL(process.env.NEXTAUTH_URL).origin : req.nextUrl.origin;
      return origin === expected;
    }
    const parsed = new URL(origin);
    return parsed.host === req.headers.get('host') &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserWithTeams();
    if (!user?.isAdmin || !user.isApproved)
      return NextResponse.json({ error: 'Nur Administratoren' }, { status: 403, headers: noStore });
    const choice = selection(req.nextUrl.searchParams.get('scope'), req.nextUrl.searchParams.get('dayId'));
    if (!choice) return NextResponse.json({ error: 'TEST-Auswahl ungültig' }, { status: 400, headers: noStore });
    const preview = await previewTestCleanup(choice);
    return NextResponse.json(preview, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vorschau fehlgeschlagen' },
      { status: 400, headers: noStore });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUserWithTeams();
    if (!user?.isAdmin || !user.isApproved)
      return NextResponse.json({ error: 'Nur Administratoren' }, { status: 403, headers: noStore });
    if (!validOrigin(req))
      return NextResponse.json({ error: 'Ungültiger Ursprung' }, { status: 403, headers: noStore });
    const gate = failures.get(user.id);
    if (gate && gate.until > Date.now() && gate.count >= 5)
      return NextResponse.json({ error: 'PIN vorübergehend gesperrt' }, { status: 429, headers: noStore });
    if (!process.env.DEMO_ORDER_PIN)
      return NextResponse.json({ error: 'Gemeinsamer Admin-PIN ist nicht konfiguriert' }, { status: 503, headers: noStore });

    const body = await req.json();
    const choice = selection(body?.scope, body?.dayId);
    if (!choice || typeof body?.pin !== 'string' || typeof body?.fingerprint !== 'string')
      return NextResponse.json({ error: 'Auswahl, PIN oder Vorschau fehlt' }, { status: 400, headers: noStore });
    if (!(await verifyTestDayPin(body.pin))) {
      const next = gate && gate.until > Date.now()
        ? { count: gate.count + 1, until: gate.until }
        : { count: 1, until: Date.now() + 15 * 60_000 };
      failures.set(user.id, next);
      return NextResponse.json({ error: 'PIN ungültig' }, { status: 403, headers: noStore });
    }
    failures.delete(user.id);

    const result = await deleteTestCleanup(choice, body.fingerprint);
    console.info('[TEST-CLEANUP]', user.id, choice.scope, result.deleted.days, 'TEST-Tage entfernt');
    return NextResponse.json(result, { headers: noStore });
  } catch (e) {
    const changed = e instanceof TestCleanupChangedError;
    console.error('[TEST-CLEANUP] Löschung nicht abgeschlossen:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: e instanceof Error ? e.message : 'TEST-Löschung fehlgeschlagen' },
      { status: changed ? 409 : 400, headers: noStore });
  }
}
