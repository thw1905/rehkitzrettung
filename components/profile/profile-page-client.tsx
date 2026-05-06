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

type ProfileForm = {
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
};

function getRoleLabel(role: string, isAdmin: boolean) {
  const roleLabel = role === "PILOT" ? "Pilot" : "Sucher";
  return isAdmin ? `${roleLabel} · Admin` : roleLabel;
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

export default function ProfilePageClient({ user }: ProfilePageClientProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [profile, setProfile] = useState<ProfileForm>({
    firstName: user.firstName,
    lastName: user.lastName,
    street: "",
    zip: "",
    city: "",
    phone: "",
    email: user.email,
  });

  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = await res.json();

        if (res.ok) {
          setProfile({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            street: data.street || "",
            zip: data.zip || "",
            city: data.city || "",
            phone: data.phone || "",
            email: data.email || "",
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

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

    loadProfile();
    loadStats();
  }, []);

  function updateProfileField(key: keyof ProfileForm, value: string) {
    setProfile((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveProfile() {
    if (!profile.firstName || !profile.lastName || !profile.email) {
      alert("Vorname, Nachname und E-Mail müssen ausgefüllt sein.");
      return;
    }

    setSavingProfile(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profile),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Profil konnte nicht gespeichert werden.");
      }

      alert("Profil erfolgreich gespeichert.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Profil konnte nicht gespeichert werden.");
    } finally {
      setSavingProfile(false);
    }
  }

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
            Hier kannst du deine persönlichen Daten, deine Statistik und dein
            Passwort verwalten.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Meine Daten
            </h2>

            <div className="mt-4 grid gap-4">
              <input
                value={profile.firstName}
                onChange={(e) => updateProfileField("firstName", e.target.value)}
                className="rounded-2xl border px-4 py-3"
                placeholder="Vorname"
              />

              <input
                value={profile.lastName}
                onChange={(e) => updateProfileField("lastName", e.target.value)}
                className="rounded-2xl border px-4 py-3"
                placeholder="Nachname"
              />

              <input
                value={profile.street}
                onChange={(e) => updateProfileField("street", e.target.value)}
                className="rounded-2xl border px-4 py-3"
                placeholder="Straße"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={profile.zip}
                  onChange={(e) => updateProfileField("zip", e.target.value)}
                  className="rounded-2xl border px-4 py-3"
                  placeholder="PLZ"
                />

                <input
                  value={profile.city}
                  onChange={(e) => updateProfileField("city", e.target.value)}
                  className="rounded-2xl border px-4 py-3"
                  placeholder="Ort"
                />
              </div>

              <input
                value={profile.phone}
                onChange={(e) => updateProfileField("phone", e.target.value)}
                className="rounded-2xl border px-4 py-3"
                placeholder="Telefon"
              />

              <input
                type="email"
                value={profile.email}
                onChange={(e) => updateProfileField("email", e.target.value)}
                className="rounded-2xl border px-4 py-3"
                placeholder="E-Mail"
              />

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                Rolle: {getRoleLabel(user.role, user.isAdmin)}
              </div>

              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="rounded-2xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {savingProfile ? "Speichert..." : "Profil speichern"}
              </button>
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
          <h2 className="text-lg font-semibold text-gray-900">
            Passwort ändern
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-2xl border px-4 py-3"
              placeholder="Aktuelles Passwort"
            />

            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-2xl border px-4 py-3"
              placeholder="Neues Passwort"
            />
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={changePassword}
              disabled={savingPassword}
              className="rounded-2xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {savingPassword ? "Speichert..." : "Passwort ändern"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}