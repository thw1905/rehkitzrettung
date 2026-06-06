"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Summary = {
  totalOrders: number;
  totalAreaSqm: number;
  totalMinutes: number;
  teamDeploymentMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  avgTeamDeploymentMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};

type TeamStat = {
  teamName: string;
  pilotName: string | null;
  searchersText: string | null;
  orderCount: number;
  totalAreaSqm: number;
  totalMinutes: number;
  teamDeploymentMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  avgTeamDeploymentMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};

type DayStat = {
  date: string;
  orderCount: number;
  totalAreaSqm: number;
  totalMinutes: number;
  teamDeploymentMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  avgTeamDeploymentMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};

type RevierStat = {
  revierId: string;
  revierName: string;
  orderCount: number;
  totalAreaSqm: number;
  totalHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  rehkitzeGesamt: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  wildGesamt: number;
  maulwurfhuegelFehlstelle: number;
  rehkitzeGesichertPerHa: number;
  rehkitzeGesamtPerHa: number;
  wildGesamtPerHa: number;
};

type DetailRow = {
  id: string;
  date: string;
  orderCode?: string | null;
  title?: string | null;
  fieldLabel: string;
  ownerName: string;
  revierName: string;
  teamName: string;
  pilotName?: string | null;
  areaSqm: number;
  areaHa: number;
  minutes: number;
  wildGesamt: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};

type FilterOption = {
  id: string;
  label: string;
};

type StatisticsResponse = {
  range: {
    from: string;
    to: string;
  };
  filters?: {
    ownerId?: string;
    revierId?: string;
    teamId?: string;
    pilotId?: string;
    fundFilter?: string;
  };
  filterOptions?: {
    owners: FilterOption[];
    reviere: FilterOption[];
    teams: FilterOption[];
    pilots: FilterOption[];
  };
  summary: Summary;
  teams: TeamStat[];
  days: DayStat[];
  reviere: RevierStat[];
  rows?: DetailRow[];
};

type PrintSections = {
  summary: boolean;
  wild: boolean;
  details: boolean;
  reviere: boolean;
  teams: boolean;
  days: boolean;
};

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDefaultSeasonRange() {
  const now = new Date();
  const year = now.getFullYear();

  return {
    from: `${year}-04-01`,
    to: `${year}-07-31`,
  };
}

function formatDate(value: string) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatHa(value: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Number.isFinite(totalMinutes) ? totalMinutes : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

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
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function SectionCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function PrintTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto print:overflow-visible">{children}</div>;
}

export default function StatisticsPageClient() {
  const defaultSeason = useMemo(() => getDefaultSeasonRange(), []);
  const initialLoadDoneRef = useRef(false);

  const [from, setFrom] = useState(defaultSeason.from);
  const [to, setTo] = useState(defaultSeason.to);
  const [ownerId, setOwnerId] = useState("");
  const [revierId, setRevierId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [pilotId, setPilotId] = useState("");
  const [fundFilter, setFundFilter] = useState("ALLE");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatisticsResponse | null>(null);
  const [sections, setSections] = useState<PrintSections>({
    summary: true,
    wild: true,
    details: true,
    reviere: true,
    teams: true,
    days: true,
  });

  const generatedAt = useMemo(() => formatDate(toDateInputValue(new Date())), []);

  async function loadStats(customFrom?: string, customTo?: string) {
    const fromValue = customFrom ?? from;
    const toValue = customTo ?? to;

    if (!fromValue || !toValue) {
      alert("Bitte Von- und Bis-Datum auswählen.");
      return;
    }

    if (fromValue > toValue) {
      alert("Das Von-Datum darf nicht nach dem Bis-Datum liegen.");
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        from: fromValue,
        to: toValue,
      });

      if (ownerId) params.set("ownerId", ownerId);
      if (revierId) params.set("revierId", revierId);
      if (teamId) params.set("teamId", teamId);
      if (pilotId) params.set("pilotId", pilotId);
      if (fundFilter && fundFilter !== "ALLE") {
        params.set("fundFilter", fundFilter);
      }

      const res = await fetch(`/api/statistics?${params.toString()}`, {
        cache: "no-store",
      });

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
    initialLoadDoneRef.current = false;

    loadStats(defaultSeason.from, defaultSeason.to).finally(() => {
      initialLoadDoneRef.current = true;
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (!from || !to) return;
    if (from > to) return;

    const timeout = window.setTimeout(() => {
      loadStats();
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, ownerId, revierId, teamId, pilotId, fundFilter]);

  function toggleSection(key: keyof PrintSections) {
    setSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function selectCurrentSeason() {
    const nextRange = getDefaultSeasonRange();
    setFrom(nextRange.from);
    setTo(nextRange.to);
    loadStats(nextRange.from, nextRange.to);
  }

  function resetFilters() {
    setOwnerId("");
    setRevierId("");
    setTeamId("");
    setPilotId("");
    setFundFilter("ALLE");
  }

  function printPage() {
    window.print();
  }

  const hasAnySection = Object.values(sections).some(Boolean);
  const filterOptions = data?.filterOptions || {
    owners: [],
    reviere: [],
    teams: [],
    pilots: [],
  };
  const rows = data?.rows || [];

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6 print:bg-white print:p-0">
      <style jsx global>{`
        @media screen and (max-width: 768px) {
          .print-page table,
          .print-page thead,
          .print-page tbody,
          .print-page tr,
          .print-page th,
          .print-page td {
            color: #111827 !important;
          }

          .print-page td {
            font-weight: 500 !important;
          }

          .print-page th {
            background: #f3f4f6 !important;
            font-weight: 800 !important;
          }
        }

        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          html,
          body {
            background: white !important;
            font-size: 13px !important;
          }

          .no-print {
            display: none !important;
          }

          .print-page {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
          }

          .print-card {
            break-inside: avoid;
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
          }

          .print-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          h1 {
            font-size: 24px !important;
          }

          h2 {
            font-size: 18px !important;
            margin-top: 14px !important;
            margin-bottom: 8px !important;
          }

          p {
            font-size: 13px !important;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 13px !important;
          }

          th,
          td {
            border: 1px solid #d1d5db !important;
            padding: 7px !important;
            vertical-align: top !important;
            line-height: 1.35 !important;
          }

          th {
            background: #f3f4f6 !important;
            font-weight: 700 !important;
          }

          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="print-page mx-auto max-w-7xl space-y-4 md:space-y-5">
        <section className="page-card print-card p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Saisonstatistik Rehkitzrettung
              </h1>
              <p className="mt-2 text-sm text-gray-700">
                Auswertung von Einsätzen, Fläche, Zeit, Teams, Wilddaten und Detailfunden.
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                Zeitraum: {formatDate(from)} bis {formatDate(to)} · Erstellt am: {generatedAt}
              </p>
            </div>

            <button
              type="button"
              onClick={printPage}
              disabled={!data || loading || !hasAnySection}
              className="no-print rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Drucken / als PDF speichern
            </button>
          </div>
        </section>

        <section className="no-print page-card p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:items-end">
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

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Besitzer
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="">Alle</option>
                {filterOptions.owners.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Revier
              </label>
              <select
                value={revierId}
                onChange={(e) => setRevierId(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="">Alle</option>
                {filterOptions.reviere.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Team
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="">Alle</option>
                {filterOptions.teams.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Pilot
              </label>
              <select
                value={pilotId}
                onChange={(e) => setPilotId(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="">Alle</option>
                {filterOptions.pilots.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Fund
              </label>
              <select
                value={fundFilter}
                onChange={(e) => setFundFilter(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="ALLE">Alle</option>
                <option value="MIT_FUND">Nur mit Fund</option>
                <option value="OHNE_FUND">Nur ohne Fund</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => loadStats()}
              className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
            >
              Aktualisieren
            </button>

            <button
              type="button"
              onClick={selectCurrentSeason}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800"
            >
              Saison wählen
            </button>

            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800"
            >
              Filter zurücksetzen
            </button>
          </div>
        </section>

        <section className="no-print page-card p-4">
          <div className="mb-3 text-sm font-bold text-gray-900">
            Was soll gedruckt werden?
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <SectionCheckbox
              label="Gesamtübersicht"
              checked={sections.summary}
              onChange={() => toggleSection("summary")}
            />
            <SectionCheckbox
              label="Wilddaten"
              checked={sections.wild}
              onChange={() => toggleSection("wild")}
            />
            <SectionCheckbox
              label="Details"
              checked={sections.details}
              onChange={() => toggleSection("details")}
            />
            <SectionCheckbox
              label="Reviere / Wild pro ha"
              checked={sections.reviere}
              onChange={() => toggleSection("reviere")}
            />
            <SectionCheckbox
              label="Teams"
              checked={sections.teams}
              onChange={() => toggleSection("teams")}
            />
            <SectionCheckbox
              label="Einsatztage"
              checked={sections.days}
              onChange={() => toggleSection("days")}
            />
          </div>

          {!hasAnySection && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Bitte mindestens einen Bereich auswählen.
            </div>
          )}
        </section>

        {loading ? (
          <section className="page-card print-card p-6 text-sm text-gray-700">
            Statistik wird geladen...
          </section>
        ) : !data ? (
          <section className="page-card print-card p-6 text-sm text-gray-700">
            Keine Daten vorhanden.
          </section>
        ) : (
          <>
            {sections.summary && (
              <section className="print-section space-y-3">
                <h2 className="text-lg font-bold text-gray-900">Gesamtübersicht</h2>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <StatCard
                    label="Erledigte Einsätze"
                    value={data.summary.totalOrders}
                    tone="slate"
                  />
                  <StatCard
                    label="Abgesuchte Fläche"
                    value={`${formatHa(data.summary.totalHa)} ha`}
                    tone="blue"
                  />
                  <StatCard
                    label="Auftragszeit"
                    value={formatMinutes(data.summary.totalMinutes)}
                    tone="amber"
                  />
                  <StatCard
                    label="Team-Einsatzzeit"
                    value={formatMinutes(data.summary.teamDeploymentMinutes)}
                    tone="amber"
                  />
                  <StatCard
                    label="Ø Auftrag min/ha"
                    value={formatHa(data.summary.avgMinPerHa)}
                    tone="green"
                  />
                  <StatCard
                    label="Ø Einsatz min/ha"
                    value={formatHa(data.summary.avgTeamDeploymentMinPerHa)}
                    tone="green"
                  />
                </div>
              </section>
            )}

            {sections.wild && (
              <section className="print-section space-y-3">
                <h2 className="text-lg font-bold text-gray-900">Wilddaten</h2>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="print-card rounded-xl border border-green-300 bg-green-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Rehkitze gesichert
                    </div>
                    <div className="mt-2 text-2xl font-bold text-green-900">
                      {formatNumber(data.summary.rehkitzeGesichert)}
                    </div>
                  </div>

                  <div className="print-card rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Rehkitze abgesprungen
                    </div>
                    <div className="mt-2 text-2xl font-bold text-amber-900">
                      {formatNumber(data.summary.rehkitzeAbgesprungen)}
                    </div>
                  </div>

                  <div className="print-card rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Sonstiges Wild gesichert
                    </div>
                    <div className="mt-2 text-2xl font-bold text-emerald-900">
                      {formatNumber(data.summary.sonstigesWildGesichert)}
                    </div>
                  </div>

                  <div className="print-card rounded-xl border border-orange-300 bg-orange-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                      Sonstiges Wild abgesprungen
                    </div>
                    <div className="mt-2 text-2xl font-bold text-orange-900">
                      {formatNumber(data.summary.sonstigesWildAbgesprungen)}
                    </div>
                  </div>

                  <div className="print-card rounded-xl border border-slate-300 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Maulwurf / Fehlstellen
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {formatNumber(data.summary.maulwurfhuegelFehlstelle)}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {sections.details && (
              <section className="page-card print-card print-section p-4 md:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">
                    Detailauswertung Fläche und Funde
                  </h2>
                  <p className="mt-1 text-sm text-gray-700">
                    Einzelne erledigte Aufträge im gewählten Filter. Wildzahlen aus Direktfunden und PinPoints werden zusammengezählt.
                  </p>
                </div>

                {rows.length === 0 ? (
                  <div className="text-sm text-gray-700">
                    Keine erledigten Aufträge im gewählten Filter.
                  </div>
                ) : (
                  <PrintTable>
                    <table className="w-full min-w-[1280px] text-left text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">Datum</th>
                          <th className="px-3 py-2">Auftrag</th>
                          <th className="px-3 py-2">Fläche</th>
                          <th className="px-3 py-2">Besitzer</th>
                          <th className="px-3 py-2">Revier</th>
                          <th className="px-3 py-2">Team</th>
                          <th className="px-3 py-2">Pilot</th>
                          <th className="px-3 py-2 text-right">ha</th>
                          <th className="px-3 py-2 text-right">Zeit</th>
                          <th className="px-3 py-2 text-right">RK ges.</th>
                          <th className="px-3 py-2 text-right">RK abg.</th>
                          <th className="px-3 py-2 text-right">SW ges.</th>
                          <th className="px-3 py-2 text-right">SW abg.</th>
                          <th className="px-3 py-2 text-right">Wild gesamt</th>
                          <th className="px-3 py-2 text-right">Maulw.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="border-t border-gray-200">
                            <td className="px-3 py-2 font-semibold text-gray-900">
                              {formatDate(row.date)}
                            </td>
                            <td className="px-3 py-2">
                              {row.orderCode || row.title || "-"}
                            </td>
                            <td className="px-3 py-2">{row.fieldLabel}</td>
                            <td className="px-3 py-2">{row.ownerName}</td>
                            <td className="px-3 py-2">{row.revierName}</td>
                            <td className="px-3 py-2">{row.teamName}</td>
                            <td className="px-3 py-2">{row.pilotName || "-"}</td>
                            <td className="px-3 py-2 text-right">{formatHa(row.areaHa)}</td>
                            <td className="px-3 py-2 text-right">{formatMinutes(row.minutes)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.rehkitzeGesichert)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.rehkitzeAbgesprungen)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.sonstigesWildGesichert)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.sonstigesWildAbgesprungen)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.wildGesamt)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.maulwurfhuegelFehlstelle)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PrintTable>
                )}
              </section>
            )}

            {sections.reviere && (
              <section className="page-card print-card print-section p-4 md:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">
                    Reviere / Wild pro Hektar
                  </h2>
                  <p className="mt-1 text-sm text-gray-700">
                    Durchschnittliche Wildzahlen je Revier bezogen auf die abgesuchte Fläche. Wildzahlen aus Direktfunden und PinPoints werden zusammengezählt.
                  </p>
                </div>

                {!data.reviere || data.reviere.length === 0 ? (
                  <div className="text-sm text-gray-700">
                    Keine Revierdaten im gewählten Zeitraum.
                  </div>
                ) : (
                  <PrintTable>
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">Revier</th>
                          <th className="px-3 py-2 text-right">Einsätze</th>
                          <th className="px-3 py-2 text-right">Fläche</th>
                          <th className="px-3 py-2 text-right">RK ges.</th>
                          <th className="px-3 py-2 text-right">RK abg.</th>
                          <th className="px-3 py-2 text-right">RK gesamt</th>
                          <th className="px-3 py-2 text-right">SW ges.</th>
                          <th className="px-3 py-2 text-right">SW abg.</th>
                          <th className="px-3 py-2 text-right">Wild gesamt</th>
                          <th className="px-3 py-2 text-right">RK ges./ha</th>
                          <th className="px-3 py-2 text-right">RK gesamt/ha</th>
                          <th className="px-3 py-2 text-right">Wild/ha</th>
                          <th className="px-3 py-2 text-right">Maulw.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reviere.map((revier) => (
                          <tr key={revier.revierId} className="border-t border-gray-200">
                            <td className="px-3 py-2 font-semibold text-gray-900">
                              {revier.revierName}
                            </td>
                            <td className="px-3 py-2 text-right">{revier.orderCount}</td>
                            <td className="px-3 py-2 text-right">{formatHa(revier.totalHa)} ha</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.rehkitzeGesichert)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.rehkitzeAbgesprungen)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.rehkitzeGesamt)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.sonstigesWildGesichert)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.sonstigesWildAbgesprungen)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.wildGesamt)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(revier.rehkitzeGesichertPerHa)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(revier.rehkitzeGesamtPerHa)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(revier.wildGesamtPerHa)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(revier.maulwurfhuegelFehlstelle)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PrintTable>
                )}
              </section>
            )}

            {sections.teams && (
              <section className="page-card print-card print-section p-4 md:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Teams</h2>
                  <p className="mt-1 text-sm text-gray-700">
                    Leistung, Auftragszeit, Team-Einsatzzeit und Wilddaten pro Team.
                  </p>
                </div>

                {data.teams.length === 0 ? (
                  <div className="text-sm text-gray-700">
                    Keine Teamdaten im gewählten Zeitraum.
                  </div>
                ) : (
                  <PrintTable>
                    <table className="w-full min-w-[1180px] text-left text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">Team</th>
                          <th className="px-3 py-2">Pilot</th>
                          <th className="px-3 py-2">Sucher</th>
                          <th className="px-3 py-2 text-right">Einsätze</th>
                          <th className="px-3 py-2 text-right">Fläche</th>
                          <th className="px-3 py-2 text-right">Auftragszeit</th>
                          <th className="px-3 py-2 text-right">Teamzeit</th>
                          <th className="px-3 py-2 text-right">Ø Auftrag min/ha</th>
                          <th className="px-3 py-2 text-right">Ø Einsatz min/ha</th>
                          <th className="px-3 py-2 text-right">RK ges.</th>
                          <th className="px-3 py-2 text-right">RK abg.</th>
                          <th className="px-3 py-2 text-right">SW ges.</th>
                          <th className="px-3 py-2 text-right">SW abg.</th>
                          <th className="px-3 py-2 text-right">Maulw.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.teams.map((team) => (
                          <tr key={team.teamName} className="border-t border-gray-200">
                            <td className="px-3 py-2 font-semibold text-gray-900">
                              {team.teamName}
                            </td>
                            <td className="px-3 py-2">{team.pilotName || "-"}</td>
                            <td className="px-3 py-2">{team.searchersText || "-"}</td>
                            <td className="px-3 py-2 text-right">{team.orderCount}</td>
                            <td className="px-3 py-2 text-right">{formatHa(team.totalHa)} ha</td>
                            <td className="px-3 py-2 text-right">{formatMinutes(team.totalMinutes)}</td>
                            <td className="px-3 py-2 text-right">{formatMinutes(team.teamDeploymentMinutes)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(team.avgMinPerHa)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(team.avgTeamDeploymentMinPerHa)}</td>
                            <td className="px-3 py-2 text-right">{team.rehkitzeGesichert}</td>
                            <td className="px-3 py-2 text-right">{team.rehkitzeAbgesprungen}</td>
                            <td className="px-3 py-2 text-right">{team.sonstigesWildGesichert}</td>
                            <td className="px-3 py-2 text-right">{team.sonstigesWildAbgesprungen}</td>
                            <td className="px-3 py-2 text-right">{team.maulwurfhuegelFehlstelle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PrintTable>
                )}
              </section>
            )}

            {sections.days && (
              <section className="page-card print-card print-section p-4 md:p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Einsatztage</h2>
                  <p className="mt-1 text-sm text-gray-700">
                    Tagesübersicht mit Auftragszeit und Team-Einsatzzeit im gewählten Zeitraum.
                  </p>
                </div>

                {data.days.length === 0 ? (
                  <div className="text-sm text-gray-700">
                    Keine Tagesdaten im gewählten Zeitraum.
                  </div>
                ) : (
                  <PrintTable>
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">Datum</th>
                          <th className="px-3 py-2 text-right">Einsätze</th>
                          <th className="px-3 py-2 text-right">Fläche</th>
                          <th className="px-3 py-2 text-right">Auftragszeit</th>
                          <th className="px-3 py-2 text-right">Teamzeit</th>
                          <th className="px-3 py-2 text-right">Ø Auftrag min/ha</th>
                          <th className="px-3 py-2 text-right">Ø Einsatz min/ha</th>
                          <th className="px-3 py-2 text-right">RK ges.</th>
                          <th className="px-3 py-2 text-right">RK abg.</th>
                          <th className="px-3 py-2 text-right">SW ges.</th>
                          <th className="px-3 py-2 text-right">SW abg.</th>
                          <th className="px-3 py-2 text-right">Maulw.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.days.map((day) => (
                          <tr key={day.date} className="border-t border-gray-200">
                            <td className="px-3 py-2 font-semibold text-gray-900">
                              {formatDate(day.date)}
                            </td>
                            <td className="px-3 py-2 text-right">{day.orderCount}</td>
                            <td className="px-3 py-2 text-right">{formatHa(day.totalHa)} ha</td>
                            <td className="px-3 py-2 text-right">{formatMinutes(day.totalMinutes)}</td>
                            <td className="px-3 py-2 text-right">{formatMinutes(day.teamDeploymentMinutes)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(day.avgMinPerHa)}</td>
                            <td className="px-3 py-2 text-right">{formatHa(day.avgTeamDeploymentMinPerHa)}</td>
                            <td className="px-3 py-2 text-right">{day.rehkitzeGesichert}</td>
                            <td className="px-3 py-2 text-right">{day.rehkitzeAbgesprungen}</td>
                            <td className="px-3 py-2 text-right">{day.sonstigesWildGesichert}</td>
                            <td className="px-3 py-2 text-right">{day.sonstigesWildAbgesprungen}</td>
                            <td className="px-3 py-2 text-right">{day.maulwurfhuegelFehlstelle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PrintTable>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
};
