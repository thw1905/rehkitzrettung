"use client";

import { useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;

  acknowledgements: {
    id: string;
    acknowledgedAt: string;
    user: {
      firstName: string;
      lastName: string;
    };
  }[];
};

export default function NotificationsAdminPageClient() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    try {
      const res = await fetch("/api/notifications/admin", {
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
        error?.message ||
          "Benachrichtigungen konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">
            Benachrichtigungen
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Übersicht aller gesendeten Einsatz-Benachrichtigungen und
            Bestätigungen.
          </p>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            Lädt...
          </section>
        ) : notifications.length === 0 ? (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            Noch keine Benachrichtigungen vorhanden.
          </section>
        ) : (
          notifications.map((notification) => (
            <section
              key={notification.id}
              className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
            >
              <div className="text-xl font-bold text-gray-900">
                {notification.title}
              </div>

              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                {notification.body}
              </div>

              <div className="mt-5">
                <div className="text-sm font-semibold text-gray-900">
                  Bestätigungen ({notification.acknowledgements.length})
                </div>

                {notification.acknowledgements.length === 0 ? (
                  <div className="mt-2 text-sm text-gray-500">
                    Noch keine Bestätigungen.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {notification.acknowledgements.map((ack) => (
                      <div
                        key={ack.id}
                        className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
                      >
                        ✓ {ack.user.firstName} {ack.user.lastName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}