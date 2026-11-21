import type { NextRequest } from 'next/server';
import { publicOrigin } from '@/lib/flight-missions/cloud-store';

/** Prueft schreibende DJI-Webanfragen; lokal gegen Host, produktiv gegen die konfigurierte Origin. */
export function isAllowedFlightMutationOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  if (process.env.NODE_ENV === 'production') {
    try { return origin === publicOrigin(req.url); }
    catch { return false; }
  }

  try {
    const received = new URL(origin);
    const host = req.headers.get('host');
    return Boolean(host) && received.host === host &&
      (received.protocol === 'http:' || received.protocol === 'https:');
  } catch {
    return false;
  }
}
