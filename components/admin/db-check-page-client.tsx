"use client";

import { useState } from "react";

type PushSubscriptionInfo = {
  id: string;
  endpoint: string;
  isActive: boolean;
  userAgent?: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string | null;
};

type UserCheckResult = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isAdmin: boolean;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  webPushSubscriptions?: PushSubscriptionInfo[];
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function boolText(value: boolean) {
  return value ? "Ja" : "Nein";
}

function boolClass(value: boolean) {
  return value
    ? "border-green-300 bg-green-50 text-green-900"
    : "border-red-300 bg-red-50 text-red-900";
}

export default function DbCheckPageClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<UserCheckResult | null>(null);

  async function checkUser() {
    const query = email.trim();

    if (!query) {
      alert("Bitte eine E-Mail eingeben.");
      return;
    }

    setLoading(true);
    setUser(null);

    try {
      const res = await fetch(
        `/api/admin/db-check/user?email=${encodeURIComponent(query)}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Benutzer konnte nicht geprüft werden.");
      }

      setUser(data.user);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Benutzer konnte nicht geprüft werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Datenbank-Check
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Hier kannst du als Admin einen Benutzer prüfen, z. B. wenn Push-Benachrichtigungen nicht funktionieren.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            E-Mail-Adresse
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.de"
              className="min-h-11 flex-1 rounded-2xl border border-gray-300 px-4 py-3"
            />

            <button
              type="button"
              onClick={checkUser}
              disabled={loading}
              className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Prüft..." : "Benutzer prüfen"}
            </button>
          </div>
        </section>

        {user && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
            <h2 className="text-xl font-bold text-gray-900">
              {user.firstName} {user.lastName}
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  E-Mail
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {user.email}
                </div>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  Rolle
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {user.role}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${boolClass(user.isApproved)}`}>
                <div className="text-xs font-semibold uppercase">
                  Freigegeben
                </div>
                <div className="mt-1 text-xl font-bold">
                  {boolText(user.isApproved)}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${user.isAdmin ? "border-blue-300 bg-blue-50 text-blue-900" : "border-gray-300 bg-gray-50 text-gray-900"}`}>
                <div className="text-xs font-semibold uppercase">
                  Admin
                </div>
                <div className="mt-1 text-xl font-bold">
                  {boolText(user.isAdmin)}
                </div>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  Angelegt
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {formatDate(user.createdAt)}
                </div>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  Aktualisiert
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {formatDate(user.updatedAt)}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-bold text-amber-950">
                Einschätzung
              </div>

              <div className="mt-2 text-sm text-amber-900">
                {!user.isApproved ? (
                  <>Der Benutzer ist nicht freigegeben. Das kann „Keine Berechtigung“ erklären.</>
                ) : user.role !== "SUCHER" && user.role !== "PILOT" ? (
                  <>Die Rolle ist ungewöhnlich. Erwartet wird SUCHER oder PILOT.</>
                ) : (
                  <>Benutzer sieht grundsätzlich korrekt aus.</>
                )}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-lg font-bold text-gray-900">
                Push-Abos
              </h3>

              {!user.webPushSubscriptions || user.webPushSubscriptions.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  Kein Push-Abo für diesen Benutzer gefunden.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {user.webPushSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            sub.isActive
                              ? "border-green-300 bg-green-50 text-green-900"
                              : "border-red-300 bg-red-50 text-red-900"
                          }`}
                        >
                          {sub.isActive ? "Aktiv" : "Inaktiv"}
                        </span>

                        <span className="text-xs text-gray-500">
                          Aktualisiert: {formatDate(sub.updatedAt)}
                        </span>
                      </div>

                      {sub.lastSeenAt && (
                        <div className="mt-2 text-xs text-gray-600">
                          Zuletzt gesehen: {formatDate(sub.lastSeenAt)}
                        </div>
                      )}

                      {sub.userAgent && (
                        <div className="mt-2 break-words text-xs text-gray-600">
                          Gerät/Browser: {sub.userAgent}
                        </div>
                      )}

                      <div className="mt-2 break-all text-xs text-gray-400">
                        Endpoint: {sub.endpoint}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}