"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotificationBell() {
  const [count, setCount] = useState(0);

  async function loadCount() {
    try {
      const res = await fetch("/api/notifications/my/unread-count", {
        cache: "no-store",
      });

      const data = await res.json();

      if (res.ok) {
        setCount(Number(data.count || 0));
      }
    } catch (error) {
      console.error("Benachrichtigungszähler Fehler:", error);
    }
  }

  useEffect(() => {
    loadCount();

    const interval = window.setInterval(loadCount, 30000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <Link
      href="/my-notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 bg-white text-lg transition hover:bg-gray-100"
      title="Meine Benachrichtigungen"
    >
      🔔

      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}