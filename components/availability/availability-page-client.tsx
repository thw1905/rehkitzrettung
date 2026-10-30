"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type SaveState = "pending" | "saving" | "saved" | "error";

type Props = {
  days?: number;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

// Vom 1. August an wird die Saison des folgenden Kalenderjahres angezeigt.
function getSeasonYear() {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return month >= 8 ? year + 1 : year;
}

function buildSeasonDays(year: number) {
  const result: string[] = [];
  const start = new Date(year, 4, 1);
  const end = new Date(year, 6, 31);

  for (
    let current = new Date(start);
    current <= end;
    current.setDate(current.getDate() + 1)
  ) {
    result.push(toDateKey(current));
  }

  return result;
}

export default function AvailabilityPageClient({ days = 92 }: Props) {
  const [drafts, setDrafts] = useState<Record<string, DayDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  // Die Refs sorgen dafür, dass parallele Änderungen an Status und Kommentar
  // niemals versehentlich einen veralteten Stand auf dem Server speichern.
  const draftsRef = useRef<Record<string, DayDraft>>({});
  const revisionRef = useRef<Record<string, number>>({});
  const savedRevisionRef = useRef<Record<string, number>>({});
  const runningSavesRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const seasonYear = getSeasonYear();

  useEffect(() => {
    let active = true;

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

        const loaded: AvailabilityItem[] = Array.isArray(data) ? data : [];
        const byDate = new Map<string, AvailabilityItem>();

        for (const item of loaded) {
          const dateKey = String(item.date).slice(0, 10);
          byDate.set(dateKey, item);
        }

        const nextDrafts: Record<string, DayDraft> = {};
        for (const date of buildSeasonDays(seasonYear)) {
          const found = byDate.get(date);
          nextDrafts[date] = {
            status: found?.status ?? "OFFEN",
            note: found?.note ?? "",
          };
        }

        if (!active) return;
        draftsRef.current = nextDrafts;
        revisionRef.current = {};
        savedRevisionRef.current = {};
        setDrafts(nextDrafts);
        setSaveStates({});
      } catch (error: unknown) {
        if (!active) return;
        console.error("Fehler beim Laden der Verfügbarkeit:", error);
        alert(error instanceof Error ? error.message : "Fehler beim Laden");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAvailability();

    return () => {
      active = false;
      for (const timer of Object.values(timersRef.current)) {
        clearTimeout(timer);
      }
      timersRef.current = {};
    };
  }, [days, seasonYear]);

  function clearSaveTimer(date: string) {
    const timer = timersRef.current[date];
    if (timer !== undefined) {
      clearTimeout(timer);
      delete timersRef.current[date];
    }
  }

  async function persistDay(date: string) {
    clearSaveTimer(date);

    // Für einen Tag darf jeweils nur eine PUT-Anfrage gleichzeitig laufen.
    if (runningSavesRef.current.has(date)) return;
    if (revisionRef.current[date] === savedRevisionRef.current[date]) return;

    runningSavesRef.current.add(date);
    setSaveStates((prev) => ({ ...prev, [date]: "saving" }));

    try {
      while (true) {
        const revision = revisionRef.current[date];
        const draft = draftsRef.current[date];
        if (!draft) break;

        const res = await fetch("/api/availability", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            status: draft.status,
            note: draft.note,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Speichern fehlgeschlagen.");
        }

        savedRevisionRef.current[date] = revision;

        // Wurde während der Anfrage weitergetippt oder der Status geändert,
        // übertragen wir danach automatisch den neuesten Stand.
        if (revisionRef.current[date] === revision) break;
      }

      setSaveStates((prev) => ({ ...prev, [date]: "saved" }));
    } catch (error: unknown) {
      console.error(`Fehler beim Speichern von ${date}:`, error);
      setSaveStates((prev) => ({ ...prev, [date]: "error" }));
    } finally {
      runningSavesRef.current.delete(date);
    }
  }

  function updateDay(date: string, changes: Partial<DayDraft>, delay: number) {
    const previous = draftsRef.current[date] ?? {
      status: "OFFEN" as AvailabilityStatus,
      note: "",
    };
    const updated = { ...previous, ...changes };

    draftsRef.current = { ...draftsRef.current, [date]: updated };
    revisionRef.current[date] = (revisionRef.current[date] ?? 0) + 1;
    setDrafts(draftsRef.current);
    setSaveStates((prev) => ({ ...prev, [date]: "pending" }));

    clearSaveTimer(date);
    if (delay === 0) {
      void persistDay(date);
    } else {
      timersRef.current[date] = setTimeout(() => {
        delete timersRef.current[date];
        void persistDay(date);
      }, delay);
    }
  }

  function updateStatus(date: string, status: AvailabilityStatus) {
    // Status wie bisher ohne zusätzlichen Button sofort speichern.
    updateDay(date, { status }, 0);
  }

  function updateNote(date: string, note: string) {
    // Nach 800 ms ohne Eingabe automatisch speichern.
    updateDay(date, { note }, 800);
  }

  const displayDays = useMemo(
    () =>
      buildSeasonDays(seasonYear).map((date) => ({
        date,
        draft: drafts[date] ?? {
          status: "OFFEN" as AvailabilityStatus,
          note: "",
        },
      })),
    [drafts, seasonYear]
  );

  if (loading) {
    return <main className="p-4">Verfügbarkeit wird geladen...</main>;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-3">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow">
          <h1 className="text-2xl font-extrabold text-black">
            Meine Verfügbarkeit
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Rehkitzrettungssaison {seasonYear} – Mai bis Juli
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {displayDays.map(({ date, draft }) => (
            <div key={date} className="rounded-2xl bg-white p-3 shadow">
              <div className="text-base font-bold text-black">
                {formatShortDate(date)}
              </div>

              <div className="mt-1 flex flex-wrap gap-2">
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
                  type="button"
                  onClick={() => updateStatus(date, "ZUGESAGT")}
                  aria-label={`Zugesagt für ${formatShortDate(date)}`}
                  aria-pressed={draft.status === "ZUGESAGT"}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "ZUGESAGT"
                      ? "bg-green-600 text-white"
                      : "bg-green-50"
                  }`}
                >
                  ✅
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(date, "VIELLEICHT")}
                  aria-label={`Vielleicht für ${formatShortDate(date)}`}
                  aria-pressed={draft.status === "VIELLEICHT"}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "VIELLEICHT"
                      ? "bg-yellow-500 text-white"
                      : "bg-yellow-50"
                  }`}
                >
                  🤔
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(date, "ABGESAGT")}
                  aria-label={`Abgesagt für ${formatShortDate(date)}`}
                  aria-pressed={draft.status === "ABGESAGT"}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "ABGESAGT"
                      ? "bg-red-600 text-white"
                      : "bg-red-50"
                  }`}
                >
                  ❌
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(date, "OFFEN")}
                  aria-label={`Offen für ${formatShortDate(date)}`}
                  aria-pressed={draft.status === "OFFEN"}
                  className={`rounded-xl p-2 text-lg ${
                    draft.status === "OFFEN"
                      ? "bg-gray-700 text-white"
                      : "bg-gray-100"
                  }`}
                >
                  ⬜
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-gray-200 px-3 py-2 text-center text-sm font-semibold">
                {draft.status === "ZUGESAGT" && (
                  <span className="text-green-800">✅ Zugesagt</span>
                )}
                {draft.status === "VIELLEICHT" && (
                  <span className="text-yellow-800">🤔 Vielleicht</span>
                )}
                {draft.status === "ABGESAGT" && (
                  <span className="text-red-800">❌ Abgesagt</span>
                )}
                {draft.status === "OFFEN" && (
                  <span className="text-gray-700">⬜ Offen</span>
                )}
              </div>

              <div className="mt-3">
                <label
                  htmlFor={`availability-note-${date}`}
                  className="mb-1 block text-xs font-semibold text-gray-700"
                >
                  Kommentar
                </label>
                <textarea
                  id={`availability-note-${date}`}
                  rows={2}
                  value={draft.note}
                  onChange={(event) => updateNote(date, event.target.value)}
                  onBlur={() => void persistDay(date)}
                  placeholder="Optionaler Kommentar ..."
                  className="w-full resize-y rounded-xl border border-gray-300 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {saveStates[date] === "pending" && (
                  <p className="mt-1 text-xs text-gray-600" role="status">
                    Änderung wird gespeichert ...
                  </p>
                )}
                {saveStates[date] === "saving" && (
                  <p className="mt-1 text-xs text-gray-600" role="status">
                    Speichert ...
                  </p>
                )}
                {saveStates[date] === "saved" && (
                  <p className="mt-1 text-xs text-green-700" role="status">
                    Gespeichert
                  </p>
                )}
                {saveStates[date] === "error" && (
                  <p className="mt-1 text-xs text-red-700" role="alert">
                    Speichern fehlgeschlagen – bitte Eingabe erneut ändern.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}