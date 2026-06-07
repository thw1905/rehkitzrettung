"use client";

import Link from "next/link";
import { useState } from "react";

export default function ReviereToolsPageClient() {
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  async function deactivateAllReviere() {
    const firstConfirm = window.confirm(
      "Wirklich ALLE Reviere auf inaktiv setzen?\n\nDanach werden Reviere in Karten und Übersichten ausgeblendet, bis du sie wieder aktiv setzt."
    );

    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      "Sicher? Diese Aktion betrifft alle Reviere.\n\nDu kannst danach die benötigten Hittfeld-Reviere unter /reviere wieder aktiv setzen."
    );

    if (!secondConfirm) return;

    setLoading(true);
    setResultMessage("");

    try {
      const res = await fetch("/api/admin/reviere/deactivate-all", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Reviere konnten nicht deaktiviert werden.");
      }

      setResultMessage(data?.message || "Reviere wurden deaktiviert.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Reviere konnten nicht deaktiviert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow md:p-6">
          <h1 className="text-2xl font-bold md:text-3xl">
            Revier-Werkzeuge
          </h1>
          <p className="mt-2 text-sm text-slate-100">
            Admin-Werkzeuge für einmalige Massenänderungen an Revieren.
          </p>
        </section>

        <section className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="text-xl font-bold text-red-800">
            Alle Reviere deaktivieren
          </h2>

          <p className="mt-2 text-sm text-gray-700">
            Diese Funktion setzt alle Reviere auf <strong>inaktiv</strong>.
            Danach kannst du unter <strong>Reviere / Jagdbezirke</strong> nur
            die Reviere vom Hegering Hittfeld wieder aktiv setzen.
          </p>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Empfehlung: Diese Funktion nur einmal verwenden, nachdem alle
            Reviere importiert wurden.
          </div>

          <button
            type="button"
            onClick={deactivateAllReviere}
            disabled={loading}
            className="mt-5 rounded-2xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? "Setze Reviere auf inaktiv..." : "Alle Reviere auf inaktiv setzen"}
          </button>

          {resultMessage ? (
            <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-900">
              {resultMessage}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Danach weiter
          </h2>

          <p className="mt-2 text-sm text-gray-700">
            Nach dem Deaktivieren gehst du in die Revierverwaltung und setzt nur
            die benötigten Reviere wieder aktiv.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/reviere"
              className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-bold text-white"
            >
              Zur Revierverwaltung
            </Link>

            <Link
              href="/hegeringe"
              className="rounded-2xl border border-gray-300 bg-white px-5 py-3 text-center text-sm font-bold text-gray-900"
            >
              Zu den Hegeringen
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}