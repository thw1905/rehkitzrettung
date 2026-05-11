"use client";

import { useEffect, useState } from "react";
import { registerWebPush } from "@/lib/push/registerWebPush";

export default function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkPushStatus() {
      try {
        if (!("serviceWorker" in navigator)) return;
        if (!("PushManager" in window)) return;

        const registration = await navigator.serviceWorker.getRegistration();

        if (!registration) {
          setVisible(true);
          return;
        }

        const subscription =
          await registration.pushManager.getSubscription();

        if (!subscription) {
          setVisible(true);
        }
      } catch (error) {
        console.error(error);
      }
    }

    checkPushStatus();
  }, []);

  async function enablePush() {
    try {
      setLoading(true);

      const result = await registerWebPush();

      if (!result.success) {
        alert(result.error || "Push konnte nicht aktiviert werden.");
        return;
      }

      setVisible(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-blue-950 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-bold md:text-base">
            🔔 Benachrichtigungen aktivieren
          </div>

          <p className="mt-1 text-sm leading-5 text-blue-900">
            Damit du Einsatzmeldungen, Änderungen und wichtige Erinnerungen
            rechtzeitig bekommst, solltest du Push-Benachrichtigungen
            aktivieren.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
          >
            Später
          </button>

          <button
            type="button"
            onClick={enablePush}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Aktiviert..." : "Jetzt aktivieren"}
          </button>
        </div>
      </div>
    </div>
  );
}