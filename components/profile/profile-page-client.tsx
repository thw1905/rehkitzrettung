"use client";

import { useEffect, useState } from "react";

type ProfilePageClientProps = {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isAdmin: boolean;
  };
};

type Stats = {
  totalMissions: number;
  totalDays: number;
};

function getRoleLabel(role: string, isAdmin: boolean) {
  const roleLabel = role === "PILOT" ? "Pilot" : "Sucher";
  return isAdmin ? `${roleLabel} · Admin` : roleLabel;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-gray-900 break-words">
        {value}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

export default function ProfilePageClient({
  user,
}: ProfilePageClientProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/profile/stats", {
          cache: "no-store",
        });
        const data = await res.json();

        if (res.ok) {
          setStats(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingStats(false);
      }
    }

    loadStats();
  }, []);

  async function changePassword() {
    if (!currentPassword || !newPassword) {
      alert("Bitte aktuelles und neues Passwort eingeben.");
      return;
    }

    if (newPassword.length < 6) {
      alert("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch("/api/profile/change-password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Passwort konnte nicht geändert werden.");
      }

      setCurrentPassword("");
      setNewPassword("");
      alert("Passwort erfolgreich geändert.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Passwort konnte nicht geändert werden.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Mein Profil
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Hier kannst du deine persönlichen Daten ansehen, deine Statistik
            prüfen und dein Passwort ändern.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
            <h2 className="text-lg font-semibold text-gray-900">Meine Daten</h2>

            <div className="mt-4 space-y-3">
              <InfoRow
                label="Name"
                value={`${user.firstName} ${user.lastName}`}
              />
              <InfoRow label="E-Mail" value={user.email} />
              <InfoRow
                label="Rolle"
                value={getRoleLabel(user.role, user.isAdmin)}
              />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Meine Einsätze
            </h2>

            {loadingStats ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                Statistik wird geladen...
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard
                  label="Einsätze gesamt"
                  value={stats?.totalMissions ?? 0}
                  className="border-slate-200 bg-slate-50 text-slate-900"
                />
                <StatCard
                  label="Einsatztage"
                  value={stats?.totalDays ?? 0}
                  className="border-blue-200 bg-blue-50 text-blue-900"
                />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Passwort ändern
            </h2>
            <p className="text-sm text-gray-600">
              Vergib ein neues Passwort mit mindestens 6 Zeichen.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Aktuelles Passwort
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-black"
                placeholder="Aktuelles Passwort eingeben"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Neues Passwort
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-black"
                placeholder="Neues Passwort eingeben"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={changePassword}
              disabled={savingPassword}
              className="w-full rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              {savingPassword ? "Speichert..." : "Passwort ändern"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}