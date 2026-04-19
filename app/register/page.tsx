"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    street: "",
    zip: "",
    city: "",
    phone: "",
    email: "",
    password: "",
    registrationCode: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRegister() {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registrierung fehlgeschlagen.");
        return;
      }

      setSuccess(
        "Registrierung erfolgreich. Ein Admin muss deinen Zugang jetzt freigeben."
      );

      setForm({
        firstName: "",
        lastName: "",
        street: "",
        zip: "",
        city: "",
        phone: "",
        email: "",
        password: "",
        registrationCode: "",
      });
    } catch (error) {
      console.error(error);
      setError("Registrierung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Registrieren</h1>
          <p className="mt-2 text-sm text-gray-700">
            Registrierung nur mit gültigem Code. Danach ist eine Admin-Freigabe nötig.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            placeholder="Vorname"
            value={form.firstName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, firstName: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            placeholder="Nachname"
            value={form.lastName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, lastName: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            placeholder="Straße"
            value={form.street}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, street: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900 md:col-span-2"
          />

          <input
            placeholder="PLZ"
            value={form.zip}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, zip: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            placeholder="Ort"
            value={form.city}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, city: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            placeholder="Telefon"
            value={form.phone}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, phone: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            type="email"
            placeholder="E-Mail"
            value={form.email}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, email: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            type="password"
            placeholder="Passwort"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, password: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900"
          />

          <input
            placeholder="Registrierungscode"
            value={form.registrationCode}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, registrationCode: e.target.value }))
            }
            className="rounded-xl border border-gray-300 px-3 py-3 text-gray-900 md:col-span-2"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {success}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <button
            type="button"
            onClick={handleRegister}
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Speichert..." : "Registrieren"}
          </button>

          <Link
            href="/login"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center font-semibold text-gray-800"
          >
            Zurück zum Login
          </Link>
        </div>
      </div>
    </main>
  );
}