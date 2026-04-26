"use client";

import { useState } from "react";
import { registerPush } from "@/lib/push/registerPush";

export default function EnablePushButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function handleEnablePush() {
    try {
      setLoading(true);
      setMessage("");

      const result = await registerPush();

      if (!result.success) {
        setMessage(result.error);
        return;
      }

      setMessage("Push-Benachrichtigungen wurden aktiviert.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleEnablePush}
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Aktiviere..." : "Push aktivieren"}
      </button>

      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}