"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilityStatus = "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";

type AvailabilityItem = {
  id: string;
  date: string;
  status: AvailabilityStatus;
  note: string | null;
};

type DayDraft = {
  status: AvailabilityStatus;
  note: string;
};

type Props = {
  days?: number;
};

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function isToday(dateKey: string) {
  return toDateKey(new Date()) === dateKey;
}

function isTomorrow(dateKey: string) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toDateKey(tomorrow) === dateKey;
}

function getStatusClasses(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") {
    return "border-green-300 bg-green-50 text-green-900";
  }
  if (status === "ABGESAGT") {
    return "border-red-300 bg-red-50 text-red-900";
  }
  if (status === "VIELLEICHT") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  return "border-gray-300 bg-gray-100 text-gray-800";
}

function getStatusLabel(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") return "Zugesagt";
  if (status === "ABGESAGT") return "Abgesagt";
  if (status === "VIELLEICHT") return "Vielleicht";
  return "Offen";
}

function buildEmptyDays(days: number) {
  const result: { date: string; status: AvailabilityStatus; note: string | null }[] = [];

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);

    result.push({
      date: toDateKey(current),
      status: "OFFEN",
      note: null,
    });
  }

  return result;
}

function StatusButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "green" | "amber" | "red" | "gray";
  onClick: () => void;
}) {
  const tones = {
    green: active
      ? "border-green-600 bg-green-600 text-white"
      : "border-green-300 bg-green-50 text-green-900",
    amber: active
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-amber-300 bg-amber-50 text-amber-900",
    red: active
      ? "border-red-600 bg-red-600 text-white"
      : "border-red-300 bg-red-50 text-red-900",
    gray: active
      ? "border-gray-700 bg-gray-700 text-white"
      : "border-gray-300 bg-gray-100 text-gray-800",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${tones[tone]}`}
    >
      {label}
    </button>
  );
}

export default function AvailabilityPageClient({ days = 21 }: Props) {
  const [items, setItems] = useState<AvailabilityItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [successDate, setSuccessDate] = useState<string | null>(null);

  async function loadAvailability() {
    setLoading(true);

    try {
      const res = await fetch(`/api/availability?days=${days}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Verfügbarkeit konnte nicht geladen werden.");
      }

      const loaded = Array.isArray(data) ? data : [];
      setItems(loaded);

      const fullDays = buildEmptyDays(days);
      const byDate = new Map<string, AvailabilityItem>();

      for (const item of loaded) {
  const key = String(item.date).slice(0, 10);

  byDate.set(key, {
    ...item,
    date: key,
  });
}

      const nextDrafts: Record<string, DayDraft> = {};

      for (const day of fullDays) {
        const found = byDate.get(day.date);
        nextDrafts[day.date] = {
          status: found?.status || "OFFEN",
          note: found?.note || "",
        };
      }

      setDrafts(nextDrafts);
    } catch (error: any) {
      console.error("Fehler beim Laden der Verfügbarkeit:", error);
      alert(error?.message || "Verfügbarkeit konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
  }, [days]);

  function updateDraft(date: string, changes: Partial<DayDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [date]: {
        ...(prev[date] || { status: "OFFEN", note: "" }),
        ...changes,
      },
    }));
  }

  async function saveDay(date: string) {
    const draft = drafts[date];
    if (!draft) return;

    setSavingDate(date);

    try {
      const res = await fetch("/api/availability", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date,
          status: draft.status,
          note: draft.note,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Speichern fehlgeschlagen.");
      }

      setSuccessDate(date);
      setTimeout(() => {
        setSuccessDate((current) => (current === date ? null : current));
      }, 1800);

      await loadAvailability();
    } catch (error: any) {
      console.error("Fehler beim Speichern:", error);
      alert(error?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSavingDate(null);
    }
  }

  const displayDays = useMemo(() => {
    const defaults = buildEmptyDays(days);
    return defaults.map((day) => ({
      date: day.date,
      draft: drafts[day.date] || {
        status: "OFFEN" as AvailabilityStatus,
        note: "",
      },
    }));
  }, [days, drafts]);

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-3xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Meine Verfügbarkeit
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Trage hier für die nächsten Tage ein, ob du helfen kannst. Das hilft
            bei der Teamplanung. Auch Admins tragen sich hier ganz normal ein.
          </p>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Verfügbarkeit wird geladen...
          </section>
        ) : (
          <div className="space-y-4">
            {displayDays.map(({ date, draft }) => {
              const saving = savingDate === date;
              const saved = successDate === date;

              return (
                <section
                  key={date}
                  className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-gray-900 capitalize">
                        {formatDayLabel(date)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {isToday(date) && (
                          <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">
                            Heute
                          </span>
                        )}
                        {isTomorrow(date) && (
                          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">
                            Morgen
                          </span>
                        )}
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            draft.status
                          )}`}
                        >
                          {getStatusLabel(draft.status)}
                        </span>
                      </div>
                    </div>

                    {saved && (
                      <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
                        ✅ Gespeichert
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <StatusButton
                      label="Zugesagt"
                      tone="green"
                      active={draft.status === "ZUGESAGT"}
                      onClick={() => updateDraft(date, { status: "ZUGESAGT" })}
                    />
                    <StatusButton
                      label="Vielleicht"
                      tone="amber"
                      active={draft.status === "VIELLEICHT"}
                      onClick={() => updateDraft(date, { status: "VIELLEICHT" })}
                    />
                    <StatusButton
                      label="Abgesagt"
                      tone="red"
                      active={draft.status === "ABGESAGT"}
                      onClick={() => updateDraft(date, { status: "ABGESAGT" })}
                    />
                    <StatusButton
                      label="Offen"
                      tone="gray"
                      active={draft.status === "OFFEN"}
                      onClick={() => updateDraft(date, { status: "OFFEN" })}
                    />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold text-gray-800">
                      Bemerkung
                    </label>
                    <textarea
                      value={draft.note}
                      onChange={(e) =>
                        updateDraft(date, { note: e.target.value })
                      }
                      placeholder="Optional, z. B. erst ab 7 Uhr oder nur bis 10 Uhr"
                      className="min-h-[96px] w-full rounded-2xl border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none transition focus:border-black"
                    />
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => saveDay(date)}
                      disabled={saving}
                      className="w-full rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50 sm:w-auto"
                    >
                      {saving ? "Speichert..." : "Für diesen Tag speichern"}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}