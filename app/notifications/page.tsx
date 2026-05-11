"use client";

import { useEffect, useState } from "react";

export default function NotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("ALL");

  const [notifications, setNotifications] = useState<any[]>([]);
const [loadingNotifications, setLoadingNotifications] = useState(true);

async function loadNotifications() {
  try {
    const res = await fetch("/api/notifications/admin", {
      cache: "no-store",
    });

    const text = await res.text();

    if (!text) {
      setNotifications([]);
      return;
    }

    const data = JSON.parse(text);

    if (!res.ok) {
      throw new Error(data?.error || "Benachrichtigungen konnten nicht geladen werden.");
    }

    setNotifications(Array.isArray(data) ? data : []);
  } catch (error: any) {
    console.error("Fehler beim Laden der Benachrichtigungen:", error);
    alert(error?.message || "Benachrichtigungen konnten nicht geladen werden.");
  } finally {
    setLoadingNotifications(false);
  }
}

useEffect(() => {
  loadNotifications();
}, []);

  async function sendReminder() {
    await fetch("/api/web-push/remind-availability", {
      method: "POST",
    });

    alert("Erinnerung gesendet ✅");
  }

  async function sendCustom() {
    const res = await fetch("/api/web-push/send-custom", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        target,
      }),
    });

    const data = await res.json();

    if (data.success) {
      alert(`Gesendet an ${data.sent} Geräte ✅`);
    } else {
      alert("Fehler beim Senden ❌");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <h1 className="text-xl font-bold">Benachrichtigungen</h1>

      {/* Erinnerung */}
      <div className="rounded-2xl border p-4">
        <h2 className="mb-2 font-semibold">
          Verfügbarkeits-Erinnerung
        </h2>

        <button
          onClick={sendReminder}
          className="rounded-xl bg-black px-4 py-2 text-white"
        >
          Erinnerung jetzt senden
        </button>
      </div>

      {/* Freie Nachricht */}
      <div className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-semibold">Nachricht senden</h2>

        <input
          placeholder="Titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
        />

        <textarea
          placeholder="Nachricht"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
        />

        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded-xl border px-3 py-2"
        >
          <option value="ALL">Alle</option>
          <option value="PILOT">Nur Piloten</option>
          <option value="SEARCHER">Nur Sucher</option>
          <option value="ADMIN">Nur Admins</option>
          <option value="PILOT_SEARCHER">Piloten + Sucher</option>
        </select>

        <button
          onClick={sendCustom}
          className="rounded-xl bg-blue-600 px-4 py-2 text-white"
        >
          Nachricht senden
        </button>
      </div>
      {/* Bestätigungen */}
<div className="rounded-2xl border p-4 space-y-3">
  <h2 className="font-semibold">Gesendete Benachrichtigungen</h2>

  {loadingNotifications ? (
    <div className="text-sm text-gray-600">Lädt...</div>
  ) : notifications.length === 0 ? (
    <div className="text-sm text-gray-600">
      Noch keine Benachrichtigungen vorhanden.
    </div>
  ) : (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="rounded-xl border bg-gray-50 p-3"
        >
          <div className="font-semibold">{notification.title}</div>

          <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {notification.body}
          </div>

          <div className="mt-3 text-sm font-semibold">
            Bestätigungen: {notification.acknowledgements?.length || 0}
          </div>

          {notification.acknowledgements?.length > 0 ? (
            <div className="mt-2 space-y-1">
              {notification.acknowledgements.map((ack: any) => (
                <div
                  key={ack.id}
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"
                >
                  ✓ {ack.user.firstName} {ack.user.lastName}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-sm text-gray-500">
              Noch keine Bestätigungen.
            </div>
          )}
        </div>
      ))}
    </div>
  )}
</div>
    </div>
  );
}