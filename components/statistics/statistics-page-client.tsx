"use client";

import { useEffect, useState } from "react";

type Summary = {
  totalOrders: number;
  totalAreaSqm: number;
  totalMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
};

type TeamStat = {
  teamName: string;
  pilotName: string | null;
  searchersText: string | null;
  orderCount: number;
  totalAreaSqm: number;
  totalMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
};

type DayStat = {
  date: string;
  orderCount: number;
  totalAreaSqm: number;
  totalMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
};

type StatisticsResponse = {
  range: {
    from: string;
    to: string;
  };
  summary: Summary;
  teams: TeamStat[];
  days: DayStat[];
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatHa(value: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "slate" | "blue" | "amber" | "green";
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-green-200 bg-green-50 text-green-900",
  };

  return (
    <div className={`page-card-muted p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function StatisticsPageClient() {
  const [from, setFrom] = useState(todayString());
  const [to, setTo] = useState(todayString());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatisticsResponse | null>(null);

  async function loadStats(customFrom?: string, customTo?: string) {
    const fromValue = customFrom ?? from;
    const toValue = customTo ?? to;

    setLoading(true);

    try {
      const res = await fetch(
        `/api/statistics?from=${encodeURIComponent(fromValue)}&to=${encodeURIComponent(toValue)}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Statistik konnte nicht geladen werden.");
      }

      setData(json);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Statistik konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats(from, to);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4 md:space-y-5">
        <section className="page-card p-4 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">Statistik</h1>
          <p className="mt-2 text-sm text-gray-700">
            Auswertung von Einsätzen, Fläche, Zeit und Wilddaten.
          </p>
        </section>

        <section className="page-card p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Von
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Bis
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <button
              onClick={() => loadStats()}
              className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
            >
              Aktualisieren
            </button>
          </div>
        </section>

        {loading ? (
          <section className="page-card p-6 text-sm text-gray-700">
            Statistik wird geladen...
          </section>
        ) : !data ? (
          <section className="page-card p-6 text-sm text-gray-700">
            Keine Daten vorhanden.
          </section>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Erledigte Einsätze"
                value={data.summary.totalOrders}
                tone="slate"
              />
              <StatCard
                label="Fläche gesamt"
                value={`${formatHa(data.summary.totalHa)} ha`}
                tone="blue"
              />
              <StatCard
                label="Zeit gesamt"
                value={formatMinutes(data.summary.totalMinutes)}
                tone="amber"
              />
              <StatCard
                label="Ø min / ha"
                value={formatHa(data.summary.avgMinPerHa)}
                tone="green"
              />
            </section>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-green-300 bg-green-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Rehkitze gesichert
                </div>
                <div className="mt-2 text-2xl font-bold text-green-900">
                  {data.summary.rehkitzeGesichert}
                </div>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Rehkitze abgesprungen
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-900">
                  {data.summary.rehkitzeAbgesprungen}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Sonstiges Wild gesichert
                </div>
                <div className="mt-2 text-2xl font-bold text-emerald-900">
                  {data.summary.sonstigesWildGesichert}
                </div>
              </div>

              <div className="rounded-xl border border-orange-300 bg-orange-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Sonstiges Wild abgesprungen
                </div>
                <div className="mt-2 text-2xl font-bold text-orange-900">
                  {data.summary.sonstigesWildAbgesprungen}
                </div>
              </div>
            </section>

            <section className="page-card p-4 md:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">Teams</h2>
                <p className="mt-1 text-sm text-gray-700">
                  Leistung und Wilddaten pro Team.
                </p>
              </div>

              {data.teams.length === 0 ? (
                <div className="text-sm text-gray-700">
                  Keine Teamdaten im gewählten Zeitraum.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.teams.map((team) => (
                    <div key={team.teamName} className="page-card-muted p-4">
                      <div className="text-base font-semibold text-gray-900">
                        {team.teamName}
                      </div>

                      <div className="mt-3 space-y-2 text-sm text-gray-800">
                        {team.pilotName && (
                          <div className="rounded-lg bg-white px-3 py-2">
                            {team.pilotName} (Pilot)
                          </div>
                        )}
                        {team.searchersText && (
                          <div className="rounded-lg bg-white px-3 py-2">
                            {team.searchersText}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Einsätze
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {team.orderCount}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Fläche
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatHa(team.totalHa)} ha
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Zeit
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatMinutes(team.totalMinutes)}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Ø min/ha
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatHa(team.avgMinPerHa)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                          <div className="text-xs font-medium text-green-700">
                            RK gesichert
                          </div>
                          <div className="mt-1 font-semibold text-green-900">
                            {team.rehkitzeGesichert}
                          </div>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <div className="text-xs font-medium text-amber-700">
                            RK abgesprungen
                          </div>
                          <div className="mt-1 font-semibold text-amber-900">
                            {team.rehkitzeAbgesprungen}
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-xs font-medium text-emerald-700">
                            SW gesichert
                          </div>
                          <div className="mt-1 font-semibold text-emerald-900">
                            {team.sonstigesWildGesichert}
                          </div>
                        </div>

                        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                          <div className="text-xs font-medium text-orange-700">
                            SW abgesprungen
                          </div>
                          <div className="mt-1 font-semibold text-orange-900">
                            {team.sonstigesWildAbgesprungen}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="page-card p-4 md:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">Tage</h2>
                <p className="mt-1 text-sm text-gray-700">
                  Tagesübersicht im gewählten Zeitraum.
                </p>
              </div>

              {data.days.length === 0 ? (
                <div className="text-sm text-gray-700">
                  Keine Tagesdaten im gewählten Zeitraum.
                </div>
              ) : (
                <div className="grid gap-3">
                  {data.days.map((day) => (
                    <div key={day.date} className="page-card-muted p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="text-base font-semibold text-gray-900">
                          {new Date(day.date).toLocaleDateString("de-DE")}
                        </div>

                        <div className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900">
                          {day.orderCount} Einsätze
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Fläche
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatHa(day.totalHa)} ha
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Zeit
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatMinutes(day.totalMinutes)}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Ø min/ha
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatHa(day.avgMinPerHa)}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Rehkitze ges.
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {day.rehkitzeGesichert}
                          </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="text-xs font-medium text-amber-700">
                            Rehkitze abg.
                          </div>
                          <div className="mt-1 font-semibold text-amber-900">
                            {day.rehkitzeAbgesprungen}
                          </div>
                        </div>

                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-xs font-medium text-emerald-700">
                            SW ges.
                          </div>
                          <div className="mt-1 font-semibold text-emerald-900">
                            {day.sonstigesWildGesichert}
                          </div>
                        </div>

                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                          <div className="text-xs font-medium text-orange-700">
                            SW abg.
                          </div>
                          <div className="mt-1 font-semibold text-orange-900">
                            {day.sonstigesWildAbgesprungen}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}