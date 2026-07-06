"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilityStatus =
  | "OFFEN"
  | "ZUGESAGT"
  | "ABGESAGT"
  | "VIELLEICHT";

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

function formatShortDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);

  return date.toLocaleDateString("de-DE", {
    weekday: "short",
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

function getStatusEmoji(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") return "✅";
  if (status === "ABGESAGT") return "❌";
  if (status === "VIELLEICHT") return "🤔";
  return "⬜";
}

function buildSeasonDays() {
  const result = [];

  const year = new Date().getFullYear();
  const start = new Date(year, 4, 1);
  const end = new Date(year, 6, 31);

  // restlicher Code...


  for (
    let current = new Date(start);
    current <= end;
    current.setDate(current.getDate() + 1)
  ) {
    result.push({
      date: toDateKey(new Date(current)),
      status: "OFFEN",
      note: null,
    });
  }

  return result;
}

export default function AvailabilityPageClient({
  days = 61,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  async function loadAvailability() {
    setLoading(true);

    try {
      const res = await fetch(`/api/availability?days=${days}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Verfügbarkeit konnte nicht geladen werden."
        );
      }

      const loaded = Array.isArray(data) ? data : [];
      const fullDays = buildSeasonDays();

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
      console.error(error);
      alert(error?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
  }, [days]);

  function updateStatus(date: string, status: AvailabilityStatus) {
    setDrafts((prev) => ({
      ...prev,
      [date]: {
        ...(prev[date] || {
          status: "OFFEN",
          note: "",
        }),
        status,
      },
    }));
  }

  async function saveDay(date: string, status: AvailabilityStatus) {
  const currentDraft = drafts[date] || {
    status: "OFFEN" as AvailabilityStatus,
    note: "",
  };

  const nextDraft = {
    ...currentDraft,
    status,
  };

  setDrafts((prev) => ({
    ...prev,
    [date]: nextDraft,
  }));

  setSavingDate(date);

  try {
    const res = await fetch("/api/availability", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date,
        status: nextDraft.status,
        note: nextDraft.note,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Speichern fehlgeschlagen.");
    }
  } catch (error: any) {
    alert(error?.message || "Fehler beim Speichern");
  } finally {
    setSavingDate(null);
  }
}

  const displayDays = useMemo(() => {
    return buildSeasonDays().map((day) => ({
      date: day.date,
      draft: drafts[day.date] || {
        status: "OFFEN" as AvailabilityStatus,
        note: "",
      },
    }));
  }, [drafts, days]);

  if (loading) {
    return (
      <main className="p-4">
        Verfügbarkeit wird geladen...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-3">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow">
          <h1 className="text-2xl font-extrabold text-black">
            Meine Verfügbarkeit
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Schnellübersicht für Mai + Juni
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {displayDays.map(({ date, draft }) => (
            <div
              key={date}
              className="rounded-2xl bg-white p-3 shadow"
            >
              <div className="text-base font-bold text-black">
                {formatShortDate(date)}
              </div>

              <div className="mt-1 flex gap-2 flex-wrap">
                {isToday(date) && (
                  <span className="text-xs font-semibold text-blue-700">
                    Heute
                  </span>
                )}

                {isTomorrow(date) && (
                  <span className="text-xs font-semibold text-indigo-700">
                    Morgen
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => saveDay(date, "ZUGESAGT")}
                  
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "ZUGESAGT"
                      ? "bg-green-600 text-white"
                      : "bg-green-50"
                  }`}
                >
                  ✅
                </button>

                <button
                  onClick={() => saveDay(date, "VIELLEICHT")}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "VIELLEICHT"
                      ? "bg-yellow-500 text-white"
                      : "bg-yellow-50"
                  }`}
                >
                  🤔
                </button>

                <button
                  onClick={() => saveDay(date, "ABGESAGT")}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "ABGESAGT"
                      ? "bg-red-600 text-white"
                      : "bg-red-50"
                  }`}
                >
                  ❌
                </button>

                <button
                  onClick={() => saveDay(date, "OFFEN")}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "OFFEN"
                      ? "bg-gray-700 text-white"
                      : "bg-gray-100"
                  }`}
                >
                  ⬜
                </button>
              </div>

              <div className="mt-3">
  <div
    className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${
      draft.status === "ZUGESAGT"
        ? "bg-green-100 text-green-800 border border-green-300"
        : draft.status === "VIELLEICHT"
        ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
        : draft.status === "ABGESAGT"
        ? "bg-red-100 text-red-800 border border-red-300"
        : "bg-gray-100 text-gray-700 border border-gray-300"
    }`}
  >
    {draft.status === "ZUGESAGT" && "✅ Zugesagt"}
    {draft.status === "VIELLEICHT" && "🤔 Vielleicht"}
    {draft.status === "ABGESAGT" && "❌ Abgesagt"}
    {draft.status === "OFFEN" && "⬜ Offen"}
  </div>

  {savingDate === date && (
    <div className="mt-2 text-center text-xs text-gray-500">
      Speichert...
    </div>
  )}
</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}