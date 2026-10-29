// REHKITZ_WILD_KONTRAST_V1 – explizit dunkle Schrift auf hellem Untergrund.
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Wild-Sicherungsort – Rehkitzrettung Hegering Hittfeld",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };
export default async function PublicWildSitePage({ params }: Props) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) notFound();
  const site = await db.securedWildLocation.findUnique({ where: { shareToken: token },
    select: { latitude: true, longitude: true, expiresAt: true,
      rehkitzeGesichert: true, sonstigesWildGesichert: true } });
  if (!site || site.expiresAt.getTime() <= Date.now()) notFound();
  const destination = `${site.latitude},${site.longitude}`;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return (
    <main className="mx-auto max-w-lg space-y-5 rounded-xl bg-white p-6 text-slate-950" style={{ minHeight: "75vh" }}>
      <h1 className="text-2xl font-bold text-slate-950">Wild-Sicherungsort</h1>
      <p className="text-base leading-relaxed text-slate-900">Dieser GPS-Punkt wurde durch die Rehkitzrettung Hegering Hittfeld freigegeben.</p>
      <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-950 space-y-2">
        <p className="font-semibold text-slate-950">Standort: {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}</p>
        <p className="text-sm text-slate-700">Gültig bis heute 24:00 Uhr (deutsche Ortszeit).</p>
      </div>
      <a href={maps} target="_blank" rel="noopener noreferrer"
         className="block rounded-xl bg-green-800 p-4 text-center font-bold text-white hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800">
        Mit Google Maps navigieren
      </a>
      <p className="text-sm leading-relaxed text-slate-700">Es ist keine Anmeldung erforderlich. Dieser Link wird um Mitternacht ungültig. Ein bereits geöffneter Kartenstandort kann von der Rehkitzrettung nicht aus Google Maps entfernt werden.</p>
    </main>
  );
}
