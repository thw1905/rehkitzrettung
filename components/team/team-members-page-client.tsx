"use client";

import { useEffect, useMemo, useState } from "react";

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
};

type Team = {
  id: string;
  teamName: string;
  pilot: Person | null;
  members: Person[];
};

type TeamOverviewResponse = {
  operationDay: {
    id: string;
    date: string;
    status: string;
  } | null;
  ownTeamId: string | null;
  teams: Team[];
  error?: string;
};

function getFullName(person: Person) {
  return `${person.firstName || ""} ${person.lastName || ""}`.trim() || "Unbekannt";
}

function normalizeWhatsappNumber(phone?: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("49")) return digits;
  if (digits.startsWith("0")) return `49${digits.slice(1)}`;

  return digits;
}

function formatRole(role?: string | null, fallback?: string) {
  if (fallback) return fallback;
  if (role === "PILOT") return "Pilot";
  return "Sucher";
}

function PersonCard({
  person,
  roleLabel,
  contactable,
}: {
  person: Person;
  roleLabel: string;
  contactable: boolean;
}) {
  const whatsappNumber = normalizeWhatsappNumber(person.phone);
  const whatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        "Hallo, ich melde mich wegen der heutigen Rehkitzrettung."
      )}`
    : "";

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-base font-semibold text-gray-900">
          {getFullName(person)}
        </div>
        <span className="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
          {formatRole(person.role, roleLabel)}
        </span>
      </div>

      {contactable && (
        <>
          <div className="mt-3 space-y-1 text-sm text-gray-700">
            <div>Telefon: {person.phone || "-"}</div>
            <div>E-Mail: {person.email || "-"}</div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <a
              href={person.phone ? `tel:${person.phone}` : undefined}
              className="rounded-xl border px-3 py-2 text-center text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              📞 Anrufen
            </a>

            <a
              href={whatsappLink || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-center text-sm font-semibold text-green-900 hover:bg-green-100"
            >
              💬 WhatsApp
            </a>

            <a
              href={person.email ? `mailto:${person.email}` : undefined}
              className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-center text-sm font-semibold text-blue-900 hover:bg-blue-100"
            >
              ✉️ E-Mail
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function TeamBlock({
  team,
  isOwnTeam,
}: {
  team: Team;
  isOwnTeam: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${
        isOwnTeam
          ? "border-green-300 bg-green-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-gray-900">{team.teamName}</h2>

        {isOwnTeam && (
          <span className="rounded-full border border-green-400 bg-green-100 px-3 py-1 text-xs font-semibold text-green-900">
            Mein Team
          </span>
        )}
      </div>

      <div className="space-y-3">
        {team.pilot ? (
          <PersonCard
            person={team.pilot}
            roleLabel="Pilot"
            contactable={true}
          />
        ) : (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
            Kein Pilot zugeordnet.
          </div>
        )}

        {team.members.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
            Keine Sucher zugeordnet.
          </div>
        ) : (
          team.members.map((member) => (
            <PersonCard
              key={member.id}
              person={member}
              roleLabel="Sucher"
              contactable={isOwnTeam}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default function TeamMembersPageClient() {
  const [data, setData] = useState<TeamOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTeamOverview() {
    try {
      const res = await fetch("/api/team-overview", { cache: "no-store" });
      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error("Server liefert keine gültige JSON-Antwort.");
      }

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Teamübersicht konnte nicht geladen werden.");
      }

      setData(json);
    } catch (error: any) {
      console.error("Fehler beim Laden der Teamübersicht:", error);
      setData({
        operationDay: null,
        ownTeamId: null,
        teams: [],
        error: error?.message || "Teamübersicht konnte nicht geladen werden.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeamOverview();
  }, []);

  const ownTeam = useMemo(() => {
    if (!data?.ownTeamId) return null;
    return data.teams.find((team) => team.id === data.ownTeamId) || null;
  }, [data]);

  const otherTeams = useMemo(() => {
    if (!data) return [];
    return data.teams.filter((team) => team.id !== data.ownTeamId);
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow">
          Teamübersicht wird geladen...
        </div>
      </main>
    );
  }

  if (!data?.operationDay) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold text-gray-900">Mein Team</h1>
          <p className="mt-2 text-sm text-gray-700">
            Für heute ist noch kein Einsatztag mit Teams angelegt.
          </p>
          {data?.error && (
            <p className="mt-3 text-sm text-red-700">{data.error}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-2xl bg-white p-5 shadow">
          <h1 className="text-2xl font-bold text-gray-900">Mein Team</h1>
          <p className="mt-2 text-sm text-gray-700">
            Teamkontakte für den heutigen Einsatztag{" "}
            {new Date(data.operationDay.date).toLocaleDateString("de-DE")}.
          </p>
        </section>

        {ownTeam ? (
  <>
    <TeamBlock team={ownTeam} isOwnTeam />

    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Andere Teams</h2>

      {otherTeams.length === 0 ? (
        <div className="rounded-2xl bg-white p-5 text-sm text-gray-700 shadow">
          Keine weiteren Teams vorhanden.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {otherTeams.map((team) => (
            <TeamBlock key={team.id} team={team} isOwnTeam={false} />
          ))}
        </div>
      )}
    </section>
  </>
) : (
  <section className="rounded-2xl border border-orange-300 bg-orange-50 p-5 text-sm text-orange-900">
    Du bist heute noch keinem Team zugeordnet.
  </section>
)}

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">Andere Teams</h2>

          {otherTeams.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-sm text-gray-700 shadow">
              Keine weiteren Teams vorhanden.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {otherTeams.map((team) => (
                <TeamBlock key={team.id} team={team} isOwnTeam={false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}