"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import Pilot2BridgeSetup from "@/components/dji/Pilot2BridgeSetup";

type Order = { id: string; orderCode: string | null; title: string };
type SetupStatus = {
  stage: string;
  workspaceConfigured: boolean;
  licenseTestConfigured: boolean;
  cloudConnectionEnabled: boolean;
  autoImportEnabled: boolean;
};

type Bridge = {
  platformIsVerified?: () => string | boolean;
  platformVerifyLicense?: (appId: string, appKey: string, license: string) => string;
  platformGetVersion?: () => string;
};

function getBridge(): Bridge | null {
  return (window as Window & { djiBridge?: Bridge }).djiBridge ?? null;
}

function parseBridgeResult(raw: unknown): { code?: number; message?: string } {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as { code?: number; message?: string };
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw as { code?: number; message?: string } : {};
}

/** Stage 2A deliberately does NOT connect to MQTT or WebSocket. */
export default function PilotLoginClient() {
  const { data: session, status: authStatus } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayKey, setTodayKey] = useState("");
  const [adminView, setAdminView] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [bridgePresent, setBridgePresent] = useState(false);
  const [bridgeReport, setBridgeReport] = useState("");
  const [pilotToken, setPilotToken] = useState<string | null>(null);

  useEffect(() => {
    setBridgePresent(Boolean(getBridge()));
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    Promise.all([
      fetch("/api/dji/pilot-sessions", { cache: "no-store" }),
      fetch("/api/dji/pilot2/status", { cache: "no-store" }),
    ]).then(async ([orderResponse, statusResponse]) => {
      if (!orderResponse.ok || !statusResponse.ok) throw new Error("Keine Pilotberechtigung oder DJI-Stufe 1 fehlt.");
      const orderJson = await orderResponse.json();
      const statusJson = await statusResponse.json();
      if (!cancelled) {
        const todayOrders: Order[] = Array.isArray(orderJson.orders) ? orderJson.orders : [];
        setOrders(todayOrders);
        setOrderId((previous) => todayOrders.some((order) => order.id === previous) ? previous : "");
        setTodayKey(typeof orderJson.date === "string" ? orderJson.date : "");
        setAdminView(Boolean(orderJson.adminView));
        setSetup(statusJson);
      }
    }).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "Fehler beim Laden.");
    });
    return () => { cancelled = true; };
  }, [authStatus]);

  async function login() {
    if (!email.trim() || !password) return setMessage("Bitte E-Mail und Passwort eingeben.");
    setBusy(true);
    setMessage("");
    try {
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false });
      setPassword("");
      if (!result || result.error) {
        setMessage(result?.error === "NOT_APPROVED" ? "Der Account wurde noch nicht freigeschaltet." : "Anmeldung fehlgeschlagen.");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Die Anmeldung konnte nicht abgeschlossen werden.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareSession() {
    if (!orderId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/dji/pilot-sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.token !== "string") {
        throw new Error(data.error || "Sitzung konnte nicht vorbereitet werden.");
      }
      setPilotToken(data.token);
      setMessage("Pilot-Sitzung angelegt (8 Stunden). Die Fernsteuerung ist damit NOCH NICHT verbunden.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fehler bei der Sitzung.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession() {
    const token = pilotToken;
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/dji/pilot-sessions", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error("Sitzung konnte nicht widerrufen werden.");
      setPilotToken(null);
      setMessage("Pilot-Sitzung widerrufen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Abmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function testLicense() {
    setMessage("");
    setBridgeReport("");
    const bridge = getBridge();
    if (!bridge?.platformVerifyLicense) return setBridgeReport("Keine DJI-JSBridge vorhanden. Den Lizenztest kannst du nur in DJI Pilot 2 ausführen.");
    setBusy(true);
    try {
      const response = await fetch("/api/dji/pilot2/bridge-license", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "DJI-Konfiguration fehlt.");
      const result = parseBridgeResult(bridge.platformVerifyLicense(data.appId, data.appKey, data.license));
      const verified = bridge.platformIsVerified?.();
      const verification = typeof verified === "string" ? parseBridgeResult(verified) : verified;
      if (result.code === 0) {
        setBridgeReport("DJI-Lizenzaufruf erfolgreich (Code 0). Brücke antwortet. Online-Verbindung noch nicht eingerichtet.");
      } else {
        // Do not show raw JSON or secrets to operators.
        setBridgeReport(`Lizenzprüfung nicht bestätigt (Code: ${result.code ?? "unbekannt"}; Status: ${typeof verification === "boolean" ? verification : "nicht verfügbar"}).`);
      }
    } catch (error) {
      setBridgeReport(error instanceof Error ? error.message : "DJI-Lizenztest fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const currentUser = session?.user as { role?: string; isAdmin?: boolean } | undefined;
  const hasRole = Boolean(currentUser?.isAdmin || currentUser?.role === "PILOT");

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-8 text-gray-900">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">Rehkitzrettung – DJI Pilot 2</h1>
        <p className="mt-2 text-sm text-gray-700">Stufe 2A: Anmeldung und Verbindungsprüfung. Der automatische Live-Import ist noch deaktiviert.</p>
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          Diese Testseite stellt <strong>noch keine Verbindung</strong> zu DJI-MQTT oder WebSocket her. Kein Fluggerät und kein Fundpunkt werden dadurch automatisch übertragen.
        </div>
      </section>
      {authStatus === "loading" ? <p>Benutzerkonto wird geprüft …</p> : authStatus === "unauthenticated" ? (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Mit deinem App-Konto anmelden</h2>
          <label className="block text-sm">E-Mail
            <input className="mt-1 w-full rounded-lg border px-3 py-3" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm">Passwort
            <input className="mt-1 w-full rounded-lg border px-3 py-3" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void login(); }} />
          </label>
          <button type="button" disabled={busy} onClick={login} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Anmeldung …" : "Anmelden"}</button>
        </section>
      ) : !hasRole ? (
        <section className="rounded-xl border p-4">Nur freigeschaltete Piloten und Administratoren dürfen die DJI-Anbindung verwenden.</section>
      ) : (
        <>
          <section className="space-y-3 rounded-2xl border bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Pilot angemeldet</h2>
              <button type="button" onClick={() => signOut({ callbackUrl: "/pilot-login" })} className="rounded-lg border px-3 py-2 text-sm">Abmelden</button>
            </div>
            <p className="text-sm">{session?.user?.name || session?.user?.email}</p>
            <p className="text-sm font-semibold text-gray-800">Heutiger Einsatztag{todayKey ? `: ${todayKey.slice(8, 10)}.${todayKey.slice(5, 7)}.${todayKey.slice(0, 4)}` : ""}</p>
            {adminView && <p className="text-xs text-slate-600">Admin-Testansicht: alle heute zugeteilten Aufträge. Piloten sehen nur ihre eigenen.</p>}
            <label className="block text-sm font-medium">Heutigen Auftrag auswählen
              <select disabled={Boolean(pilotToken)} className="mt-1 w-full rounded-lg border bg-white p-3" value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                <option value="">Bitte Auftrag wählen</option>
                {orders.map((order) => <option key={order.id} value={order.id}>{order.orderCode || order.title}</option>)}
              </select>
            </label>
            {!orders.length && <p className="text-sm text-amber-800">Für heute sind keine offenen oder laufenden Aufträge zugeteilt.</p>}
            {setup && !setup.workspaceConfigured && <p className="text-sm text-amber-800">DJI_WORKSPACE_ID fehlt noch. Diese wird einmalig beim Update eingerichtet; anschließend Next.js neu starten.</p>}
            <button type="button" disabled={busy || !orderId || Boolean(pilotToken) || !setup?.workspaceConfigured} onClick={prepareSession} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">Test-Sitzung vorbereiten</button>
            {pilotToken && <button type="button" disabled={busy} onClick={revokeSession} className="w-full rounded-lg border px-4 py-3 text-sm disabled:opacity-50">Test-Sitzung widerrufen</button>}
          </section>
          <section className="space-y-3 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-semibold">DJI-Fernsteuerung prüfen</h2>
            <p className="text-sm">JSBridge: <strong>{bridgePresent ? "erkannt" : "im normalen Browser nicht vorhanden"}</strong></p>
            <p className="text-sm">DJI-Lizenztest: {setup?.licenseTestConfigured ? "konfiguriert" : "noch nicht konfiguriert"}</p>
            <button type="button" disabled={busy || !setup?.licenseTestConfigured} onClick={testLicense} className="w-full rounded-lg border px-4 py-3 text-sm font-semibold disabled:opacity-50">DJI-Lizenz auf Fernsteuerung prüfen</button>
            {bridgeReport && <p className="rounded-lg bg-slate-100 p-3 text-sm" role="status">{bridgeReport}</p>}
          </section>
        </>
      )}
      {authStatus === "authenticated" && hasRole && <Pilot2BridgeSetup token={pilotToken} />}
      {message && <p className="rounded-xl border bg-white p-3 text-sm" role="status">{message}</p>}
      <p className="text-center text-xs text-gray-600">Es werden keine DJI-Zugangsschlüssel in dieser Seite angezeigt oder protokolliert.</p>
    </main>
  );
}
