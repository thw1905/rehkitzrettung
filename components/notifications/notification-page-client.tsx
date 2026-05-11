"use client";

import { useEffect, useState } from "react";

type NotificationData = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
};

type Props = {
  notificationId: string;
};

export default function NotificationPageClient({
  notificationId,
}: Props) {
  const [notification, setNotification] =
    useState<NotificationData | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadNotification() {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Benachrichtigung konnte nicht geladen werden."
        );
      }

      setNotification(data);
    } catch (error: any) {
      console.error(error);
      alert(
        error?.message ||
          "Benachrichtigung konnte nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotification();
  }, [notificationId]);

  async function acknowledge() {
    setSaving(true);

    try {
      const res = await fetch(
        `/api/notifications/${notificationId}/acknowledge`,
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Bestätigung konnte nicht gespeichert werden."
        );
      }

      await loadNotification();
    } catch (error: any) {
      console.error(error);
      alert(
        error?.message ||
          "Bestätigung konnte nicht gespeichert werden."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          Benachrichtigung wird geladen...
        </div>
      </main>
    );
  }

  if (!notification) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="text-2xl font-bold text-gray-900">
          {notification.title}
        </div>

        <div className="mt-3 whitespace-pre-wrap text-base leading-7 text-gray-700">
          {notification.body}
        </div>

        <div className="mt-6">
          {notification.acknowledged ? (
            <div className="rounded-2xl border border-green-300 bg-green-50 px-4 py-4 text-sm font-semibold text-green-900">
              ✓ Zur Kenntnis genommen
            </div>
          ) : (
            <button
              type="button"
              onClick={acknowledge}
              disabled={saving}
              className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
            >
              {saving
                ? "Speichert..."
                : "Zur Kenntnis genommen"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}