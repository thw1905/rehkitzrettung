"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: string;
  date: string | null;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyNotificationsPageClient() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const openCount = useMemo(
    () => notifications.filter((item) => !item.acknowledged).length,
    [notifications]
  );

  async function loadNotifications() {
    try {
      const res = await fetch("/api/notifications/my", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Benachrichtigungen konnten nicht geladen werden."
        );
      }

      setNotifications(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error(error);
      alert(
        error?.message || "Benachrichtigungen konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);
  async function acknowledge(notificationId: string) {
    setSavingId(notificationId);

    try {
      const res = await fetch(`/api/notifications/${notificationId}/acknowledge`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Bestätigung konnte nicht gespeichert werden."
        );
      }

      await loadNotifications();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Bestätigung konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Meine Benachrichtigungen
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Hier siehst du Einsatzinfos und kannst bestätigen, dass du sie gelesen hast.
          </p>

          {openCount > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {openCount} offene Benachrichtigung{openCount === 1 ? "" : "en"}
            </div>
          )}
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            Lädt...
          </section>
        ) : notifications.length === 0 ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-600 shadow-sm ring-1 ring-gray-100">
            Keine Benachrichtigungen vorhanden.
          </section>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              <section
                key={item.id}
                className={`rounded-3xl p-5 shadow-sm ring-1 ring-gray-100 ${
                  item.acknowledged
                    ? "bg-white"
                    : "border border-amber-300 bg-amber-50"
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-bold text-gray-900">
                      {item.title}
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {item.body}
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                      Gesendet: {formatDateTime(item.createdAt)}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <Link
                      href={`/notifications/${item.id}`}
                      className="rounded-2xl border border-gray-300 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                      Öffnen
                    </Link>

                    {item.acknowledged ? (
                      <div className="rounded-2xl border border-green-300 bg-green-50 px-4 py-2 text-center text-sm font-semibold text-green-900">
                        ✓ Bestätigt
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => acknowledge(item.id)}
                        disabled={savingId === item.id}
                        className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {savingId === item.id
                          ? "Speichert..."
                          : "Zur Kenntnis genommen"}
                      </button>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}