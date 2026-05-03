"use client";

import { useState } from "react";

export default function NotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("ALL");

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
    </div>
  );
}