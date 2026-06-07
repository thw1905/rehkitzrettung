"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string | null;
};

type CorrectionPreview = {
  counts: {
    ordersAsOwner: number;
    ordersAsContact: number;
    fields: number;
    mowingRequests: number;
    accessTokens: number;
    activeAccessTokens: number;
  };
  ordersAsOwner: any[];
  ordersAsContact: any[];
  fields: any[];
  mowingRequests: any[];
};

type CorrectionResponse = {
  success?: boolean;
  dryRun?: boolean;
  message?: string;
  error?: string;
  preview?: CorrectionPreview;
  previewBefore?: CorrectionPreview;
  previewAfter?: CorrectionPreview;
  updated?: {
    ordersAsOwner: number;
    ordersAsContact: number;
    fields: number;
    mowingRequests: number;
    accessTokensDeactivated: number;
  };
};

function getOwnerName(owner?: Pick<Owner, "firstName" | "lastName"> | null) {
  if (!owner) return "";
  return `${owner.firstName || ""} ${owner.lastName || ""}`.trim();
}

function getFieldLabel(field: any) {
  const displayName = (field?.displayName || "").trim();
  const name = (field?.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

export default function OwnerCorrectionPageClient() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(true);

  const [fromOwnerId, setFromOwnerId] = useState("");
  const [toOwnerId, setToOwnerId] = useState("");

  const [replaceOrdersAsOwner, setReplaceOrdersAsOwner] = useState(true);
  const [replaceOrdersAsContact, setReplaceOrdersAsContact] = useState(true);
  const [replaceFields, setReplaceFields] = useState(true);
  const [replaceMowingRequests, setReplaceMowingRequests] = useState(true);
  const [deactivateOldAccessTokens, setDeactivateOldAccessTokens] =
    useState(true);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [lastResult, setLastResult] = useState<CorrectionResponse | null>(null);

  const selectedFromOwner = owners.find((owner) => owner.id === fromOwnerId);
  const selectedToOwner = owners.find((owner) => owner.id === toOwnerId);

  const filteredToOwners = useMemo(
    () => owners.filter((owner) => owner.id !== fromOwnerId),
    [owners, fromOwnerId]
  );

  async function loadOwners() {
    setLoadingOwners(true);

    try {
      const res = await fetch("/api/owners", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Landwirte konnten nicht geladen werden.");
      }

      setOwners(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Landwirte konnten nicht geladen werden.");
    } finally {
      setLoadingOwners(false);
    }
  }

  useEffect(() => {
    loadOwners();
  }, []);

  async function runCorrection(dryRun: boolean) {
    if (!fromOwnerId) {
      alert("Bitte den falsch angelegten Landwirt auswählen.");
      return;
    }

    if (!toOwnerId) {
      alert("Bitte den richtigen Landwirt auswählen.");
      return;
    }

    if (fromOwnerId === toOwnerId) {
      alert("Falscher und richtiger Landwirt dürfen nicht identisch sein.");
      return;
    }

    if (!dryRun) {
      const confirmed = window.confirm(
        `Wirklich alle ausgewählten Zuordnungen von "${getOwnerName(
          selectedFromOwner
        )}" auf "${getOwnerName(
          selectedToOwner
        )}" umhängen?\n\nErledigte Aufträge bleiben erledigt. Es wird nur die Landwirt-/Ansprechpartner-Zuordnung korrigiert.`
      );

      if (!confirmed) return;

      const confirmedAgain = window.confirm(
        "Sicher? Diese Änderung betrifft auch historische Aufträge und Stammdaten."
      );

      if (!confirmedAgain) return;
    }

    if (dryRun) {
      setLoadingPreview(true);
      setPreview(null);
    } else {
      setExecuting(true);
    }

    setLastResult(null);

    try {
      const res = await fetch("/api/admin/owners/replace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromOwnerId,
          toOwnerId,
          dryRun,
          replaceOrdersAsOwner,
          replaceOrdersAsContact,
          replaceFields,
          replaceMowingRequests,
          deactivateOldAccessTokens,
        }),
      });

      const data: CorrectionResponse = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Korrektur konnte nicht ausgeführt werden.");
      }

      if (dryRun) {
        setPreview(data.preview || null);
      } else {
        setLastResult(data);
        setPreview(data.previewAfter || null);
        alert(data.message || "Korrektur wurde ausgeführt.");
        await loadOwners();
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Korrektur konnte nicht ausgeführt werden.");
    } finally {
      setLoadingPreview(false);
      setExecuting(false);
    }
  }

  const hasAnyUsage =
    preview &&
    (preview.counts.ordersAsOwner > 0 ||
      preview.counts.ordersAsContact > 0 ||
      preview.counts.fields > 0 ||
      preview.counts.mowingRequests > 0 ||
      preview.counts.activeAccessTokens > 0);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow md:p-6">
          <h1 className="text-2xl font-bold md:text-3xl">
            Landwirt-Zuordnung korrigieren
          </h1>
          <p className="mt-2 text-sm text-slate-100">
            Admin-Korrektur für falsch angelegte Landwirte, die bereits in
            Aufträgen, Flächen oder Mähanfragen verwendet wurden.
          </p>
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <div className="font-bold">Wichtig</div>
          <p className="mt-1 text-sm leading-6">
            Diese Funktion öffnet erledigte Aufträge nicht wieder. Sie ändert nur
            die Zuordnung von Landwirt oder Ansprechpartner. Einsatzzeiten,
            Wildzahlen, Pinpoints, Status und Statistikdaten bleiben erhalten.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-xl font-bold text-gray-900">
            1. Landwirte auswählen
          </h2>

          {loadingOwners ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              Landwirte werden geladen...
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Falsch angelegter Landwirt
                </label>
                <select
                  value={fromOwnerId}
                  onChange={(event) => {
                    setFromOwnerId(event.target.value);
                    setPreview(null);
                    setLastResult(null);

                    if (event.target.value === toOwnerId) {
                      setToOwnerId("");
                    }
                  }}
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3"
                >
                  <option value="">Bitte auswählen</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {getOwnerName(owner)} · {owner.zip} {owner.city}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Richtiger Landwirt
                </label>
                <select
                  value={toOwnerId}
                  onChange={(event) => {
                    setToOwnerId(event.target.value);
                    setPreview(null);
                    setLastResult(null);
                  }}
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3"
                >
                  <option value="">Bitte auswählen</option>
                  {filteredToOwners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {getOwnerName(owner)} · {owner.zip} {owner.city}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-xl font-bold text-gray-900">
            2. Was soll korrigiert werden?
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-900">
              <input
                type="checkbox"
                checked={replaceOrdersAsOwner}
                onChange={(event) => setReplaceOrdersAsOwner(event.target.checked)}
                className="mt-1"
              />
              <span>
                Aufträge als Landwirt korrigieren
                <span className="mt-1 block text-xs font-normal text-gray-600">
                  Ändert ownerId im Auftrag.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-900">
              <input
                type="checkbox"
                checked={replaceOrdersAsContact}
                onChange={(event) =>
                  setReplaceOrdersAsContact(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                Aufträge als Ansprechpartner korrigieren
                <span className="mt-1 block text-xs font-normal text-gray-600">
                  Ändert contactOwnerId im Auftrag.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-900">
              <input
                type="checkbox"
                checked={replaceFields}
                onChange={(event) => setReplaceFields(event.target.checked)}
                className="mt-1"
              />
              <span>
                Flächen umhängen
                <span className="mt-1 block text-xs font-normal text-gray-600">
                  Ändert den Landwirt an betroffenen Flächen.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-900">
              <input
                type="checkbox"
                checked={replaceMowingRequests}
                onChange={(event) =>
                  setReplaceMowingRequests(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                Mähanfragen umhängen
                <span className="mt-1 block text-xs font-normal text-gray-600">
                  Ändert den Landwirt an alten Mähanfragen.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-900 md:col-span-2">
              <input
                type="checkbox"
                checked={deactivateOldAccessTokens}
                onChange={(event) =>
                  setDeactivateOldAccessTokens(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                Alte Landwirt-Links des falschen Eintrags deaktivieren
                <span className="mt-1 block text-xs font-normal text-gray-600">
                  Empfohlen, damit der falsche Eintrag keinen aktiven Link mehr hat.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => runCorrection(true)}
              disabled={loadingPreview || executing}
              className="rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-900 disabled:opacity-50"
            >
              {loadingPreview ? "Prüfe..." : "Verwendung prüfen"}
            </button>

            <button
              type="button"
              onClick={() => runCorrection(false)}
              disabled={loadingPreview || executing || !preview}
              className="rounded-2xl bg-black px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {executing ? "Korrigiere..." : "Korrektur ausführen"}
            </button>
          </div>
        </section>

        {preview && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
            <h2 className="text-xl font-bold text-gray-900">
              3. Gefundene Verwendungen
            </h2>

            {!hasAnyUsage ? (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-900">
                Dieser Landwirt wird aktuell nicht mehr verwendet. Du kannst ihn
                jetzt in der Landwirtverwaltung löschen.
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
                    <div className="text-2xl font-bold">
                      {preview.counts.ordersAsOwner}
                    </div>
                    <div className="text-xs font-semibold">
                      Aufträge als Landwirt
                    </div>
                  </div>

                  <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-purple-950">
                    <div className="text-2xl font-bold">
                      {preview.counts.ordersAsContact}
                    </div>
                    <div className="text-xs font-semibold">
                      Aufträge als Ansprechpartner
                    </div>
                  </div>

                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-green-950">
                    <div className="text-2xl font-bold">
                      {preview.counts.fields}
                    </div>
                    <div className="text-xs font-semibold">Flächen</div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <div className="text-2xl font-bold">
                      {preview.counts.mowingRequests}
                    </div>
                    <div className="text-xs font-semibold">Mähanfragen</div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-gray-900">
                    <div className="text-2xl font-bold">
                      {preview.counts.activeAccessTokens}
                    </div>
                    <div className="text-xs font-semibold">
                      aktive Landwirt-Links
                    </div>
                  </div>
                </div>

                {preview.ordersAsOwner.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <h3 className="font-bold text-blue-950">
                      Aufträge als Landwirt
                    </h3>

                    <div className="mt-3 space-y-2">
                      {preview.ordersAsOwner.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-xl bg-white px-3 py-2 text-sm text-blue-950"
                        >
                          <strong>{order.orderCode || order.title}</strong> ·{" "}
                          {order.status} · {formatDate(order.mowingDate)} ·{" "}
                          {getFieldLabel(order.field)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.ordersAsContact.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-purple-200 bg-purple-50 p-4">
                    <h3 className="font-bold text-purple-950">
                      Aufträge als Ansprechpartner
                    </h3>

                    <div className="mt-3 space-y-2">
                      {preview.ordersAsContact.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-xl bg-white px-3 py-2 text-sm text-purple-950"
                        >
                          <strong>{order.orderCode || order.title}</strong> ·{" "}
                          {order.status} · {formatDate(order.mowingDate)} ·{" "}
                          {getFieldLabel(order.field)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.fields.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
                    <h3 className="font-bold text-green-950">Flächen</h3>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {preview.fields.map((field) => (
                        <span
                          key={field.id}
                          className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-green-950"
                        >
                          {getFieldLabel(field)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {preview.mowingRequests.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <h3 className="font-bold text-amber-950">Mähanfragen</h3>

                    <div className="mt-3 space-y-2">
                      {preview.mowingRequests.map((request) => (
                        <div
                          key={request.id}
                          className="rounded-xl bg-white px-3 py-2 text-sm text-amber-950"
                        >
                          {formatDate(request.mowingDate)} · {request.status}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {lastResult && (
          <section className="rounded-3xl border border-green-200 bg-green-50 p-5 text-green-950 shadow-sm">
            <h2 className="text-xl font-bold">Korrektur ausgeführt</h2>
            <p className="mt-2 text-sm">{lastResult.message}</p>

            {lastResult.updated && (
              <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <div>Aufträge als Landwirt: {lastResult.updated.ordersAsOwner}</div>
                <div>
                  Aufträge als Ansprechpartner:{" "}
                  {lastResult.updated.ordersAsContact}
                </div>
                <div>Flächen: {lastResult.updated.fields}</div>
                <div>Mähanfragen: {lastResult.updated.mowingRequests}</div>
                <div>
                  Alte Links deaktiviert:{" "}
                  {lastResult.updated.accessTokensDeactivated}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/owners"
                className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-bold text-white"
              >
                Zur Landwirtverwaltung
              </Link>

              <button
                type="button"
                onClick={() => runCorrection(true)}
                className="rounded-2xl border border-green-300 bg-white px-5 py-3 text-sm font-bold text-green-900"
              >
                Erneut prüfen
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}