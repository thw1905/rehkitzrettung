"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = {
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  isAdmin: boolean;
  status: "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";
  note: string | null;
};

type DayOverview = {
  date: string;
  zugesagt: number;
  abgesagt: number;
  vielleicht: number;
  offen: number;
  entries: Entry[];
};

type Props = {
  days?: number;
};

type QuickFilter = "ALLE" | "HEUTE_MORGEN" | "MORGEN";

function formatDayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getTomorrowKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function isToday(dateKey: string) {
  return getTodayKey() === dateKey;
}

function isTomorrow(dateKey: string) {
  return getTomorrowKey() === dateKey;
}

function roleLabel(role: string, isAdmin: boolean) {
  const base = role === "PILOT" ? "Pilot" : "Sucher";
  return isAdmin ? `${base} · Admin` : base;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "red" | "gray";
}) {
  const tones = {
    green: "border-green-200 bg-green-50 text-green-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    gray: "border-gray-200 bg-gray-100 text-gray-900",
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function DayStatMiniCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "red" | "gray";
}) {
  const tones = {
    green: "border-green-200 bg-green-50 text-green-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    gray: "border-gray-200 bg-gray-100 text-gray-900",
  };

  return (
    <div className={`rounded-2xl border px-3 py-3 ${tones[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function PersonCard({
  entry,
  tone,
}: {
  entry: Entry;
  tone: "green" | "amber" | "red" | "gray";
}) {
  const tones = {
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    gray: "border-gray-200 bg-gray-50",
  };

  return (
    <div className={`rounded-2xl border p-3 ${tones[tone]}`}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">
          {entry.firstName} {entry.lastName}
        </div>
        <div className="mt-1 text-xs text-gray-600">
          {roleLabel(entry.role, entry.isAdmin)}
        </div>
      </div>

      {entry.note && (
        <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-sm text-gray-700">
          {entry.note}
        </div>
      )}
    </div>
  );
}

function SectionBlock({
  title,
  emptyText,
  tone,
  entries,
}: {
  title: string;
  emptyText: string;
  tone: "green" | "amber" | "red" | "gray";
  entries: Entry[];
}) {
  const titleClass = {
    green: "text-green-800",
    amber: "text-amber-800",
    red: "text-red-800",
    gray: "text-gray-800",
  }[tone];

  return (
    <div>
      <div className={`mb-2 text-sm font-semibold ${titleClass}`}>{title}</div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <PersonCard key={entry.userId} entry={entry} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-3 text-sm font-semibold transition",
        active
          ? "bg-black text-white"
          : "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default function AvailabilityAdminPageClient({ days = 21 }: Props) {
  const [items, setItems] = useState<DayOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("HEUTE_MORGEN");
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");

  async function loadOverview() {
    setLoading(true);

    try {
      const res = await fetch(`/api/availability/admin?days=${days}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Admin-Verfügbarkeiten konnten nicht geladen werden."
        );
      }

      const loaded = Array.isArray(data) ? data : [];
      setItems(loaded);

      setOpenDates((prev) => {
        const next = { ...prev };

        for (const item of loaded) {
          if (next[item.date] === undefined) {
            next[item.date] = isToday(item.date) || isTomorrow(item.date);
          }
        }

        return next;
      });
    } catch (error: any) {
      console.error("Fehler beim Laden der Admin-Verfügbarkeiten:", error);
      alert(
        error?.message || "Admin-Verfügbarkeiten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, [days]);

  function toggleDate(date: string) {
    setOpenDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  }

  const filteredItems = useMemo(() => {
    const todayKey = getTodayKey();
    const tomorrowKey = getTomorrowKey();
    const term = search.trim().toLowerCase();

    let result = [...items];

    if (selectedDate) {
      result = result.filter((item) => item.date === selectedDate);
    } else if (quickFilter === "MORGEN") {
      result = result.filter((item) => item.date === tomorrowKey);
    } else if (quickFilter === "HEUTE_MORGEN") {
      result = result.filter(
        (item) => item.date === todayKey || item.date === tomorrowKey
      );
    }

    if (!term) return result;

    return result
      .map((day) => {
        const entries = day.entries.filter((entry) =>
          [
            entry.firstName,
            entry.lastName,
            entry.role,
            entry.isAdmin ? "admin" : "",
            entry.status,
            entry.note || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(term)
        );

        return {
          ...day,
          entries,
          zugesagt: entries.filter((e) => e.status === "ZUGESAGT").length,
          vielleicht: entries.filter((e) => e.status === "VIELLEICHT").length,
          abgesagt: entries.filter((e) => e.status === "ABGESAGT").length,
          offen: entries.filter((e) => e.status === "OFFEN").length,
        };
      })
      .filter((day) => day.entries.length > 0);
  }, [items, quickFilter, selectedDate, search]);

  const totals = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        acc.zugesagt += item.zugesagt;
        acc.vielleicht += item.vielleicht;
        acc.abgesagt += item.abgesagt;
        acc.offen += item.offen;
        return acc;
      },
      {
        zugesagt: 0,
        vielleicht: 0,
        abgesagt: 0,
        offen: 0,
      }
    );
  }, [filteredItems]);

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Verfügbarkeiten
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Hier siehst du für die nächsten Tage, wer zugesagt, vielleicht,
            abgesagt oder noch nicht geantwortet hat.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-3">
              <FilterButton
                active={!selectedDate && quickFilter === "HEUTE_MORGEN"}
                label="Heute + morgen"
                onClick={() => {
                  setSelectedDate("");
                  setQuickFilter("HEUTE_MORGEN");
                }}
              />
              <FilterButton
                active={!selectedDate && quickFilter === "MORGEN"}
                label="Nur morgen"
                onClick={() => {
                  setSelectedDate("");
                  setQuickFilter("MORGEN");
                }}
              />
              <FilterButton
                active={!selectedDate && quickFilter === "ALLE"}
                label="Alle nächsten Tage"
                onClick={() => {
                  setSelectedDate("");
                  setQuickFilter("ALLE");
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Bestimmtes Datum
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base md:min-w-[220px]"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Person suchen
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, Rolle, Status oder Bemerkung ..."
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base"
            />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Zugesagt" value={totals.zugesagt} tone="green" />
          <StatCard label="Vielleicht" value={totals.vielleicht} tone="amber" />
          <StatCard label="Abgesagt" value={totals.abgesagt} tone="red" />
          <StatCard label="Offen" value={totals.offen} tone="gray" />
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Übersicht wird geladen...
          </section>
        ) : filteredItems.length === 0 ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Keine passenden Verfügbarkeiten gefunden.
          </section>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((day) => {
              const zugesagt = day.entries.filter((e) => e.status === "ZUGESAGT");
              const vielleicht = day.entries.filter(
                (e) => e.status === "VIELLEICHT"
              );
              const abgesagt = day.entries.filter((e) => e.status === "ABGESAGT");
              const offen = day.entries.filter((e) => e.status === "OFFEN");

              const isOpen = !!openDates[day.date];

              return (
                <section
                  key={day.date}
                  className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100"
                >
                  <button
                    type="button"
                    onClick={() => toggleDate(day.date)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left md:px-5"
                  >
                    <div className="min-w-0">
                      <div className="text-lg font-semibold capitalize text-gray-900">
                        {formatDayLabel(day.date)}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {isToday(day.date) && (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
                            Heute
                          </span>
                        )}
                        {isTomorrow(day.date) && (
                          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">
                            Morgen
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <DayStatMiniCard
                          label="Zugesagt"
                          value={day.zugesagt}
                          tone="green"
                        />
                        <DayStatMiniCard
                          label="Vielleicht"
                          value={day.vielleicht}
                          tone="amber"
                        />
                        <DayStatMiniCard
                          label="Abgesagt"
                          value={day.abgesagt}
                          tone="red"
                        />
                        <DayStatMiniCard
                          label="Offen"
                          value={day.offen}
                          tone="gray"
                        />
                      </div>
                    </div>

                    <div className="shrink-0 rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-700">
                      {isOpen ? "−" : "+"}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-200 px-4 py-4 md:px-5">
                      <div className="space-y-5">
                        <SectionBlock
                          title="Zugesagt"
                          emptyText="Keine Zusagen."
                          tone="green"
                          entries={zugesagt}
                        />

                        <SectionBlock
                          title="Vielleicht"
                          emptyText="Keine Vielleicht-Antworten."
                          tone="amber"
                          entries={vielleicht}
                        />

                        <SectionBlock
                          title="Abgesagt"
                          emptyText="Keine Absagen."
                          tone="red"
                          entries={abgesagt}
                        />

                        <SectionBlock
                          title="Offen"
                          emptyText="Alle haben bereits geantwortet."
                          tone="gray"
                          entries={offen}
                        />
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}