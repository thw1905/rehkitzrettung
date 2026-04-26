"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
/*import SupportContactButton from "@/components/layout/support-contact-button";*/

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result) {
        setError("Anmeldung fehlgeschlagen.");
        return;
      }

      if (result.error === "NOT_APPROVED") {
        setError("Dein Zugang wurde noch nicht von einem Admin freigegeben.");
        return;
      }

      if (result.error) {
        setError("E-Mail oder Passwort ist falsch.");
        return;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Login-Fehler:", err);
      setError("Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg md:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Anmelden</h1>
          <p className="mt-2 text-sm text-gray-700">
            Rehkitzrettung Einsatzsystem
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-800"
            >
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 outline-none focus:border-black"
              placeholder="name@beispiel.de"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-800"
            >
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLogin();
                }
              }}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 outline-none focus:border-black"
              placeholder="Passwort eingeben"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          
          
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Anmeldung läuft..." : "Anmelden"}
          </button>

          <Link
            href="/register"
            className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-base font-semibold text-gray-800"
          >
            Neu registrieren
          </Link>
        </div>
      </div>
    </main>
  );
}