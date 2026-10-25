"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type BridgeResult = { code?: number; data?: unknown };
type DjiBridge = {
  platformVerifyLicense?: (appId: string, appKey: string, license: string) => string;
  platformIsVerified?: () => string | boolean;
  platformSetWorkspaceId?: (id: string) => string;
  platformSetInformation?: (platform: string, name: string, description: string) => string;
  platformLoadComponent?: (name: string, params: string) => string;
  platformIsComponentLoaded?: (name: string) => string | boolean;
  wsGetConnectState?: () => string | boolean;
  wsDisconnect?: () => string;
};
type DjiWindow = Window & { djiBridge?: DjiBridge; rehkitzQuickWsCallback?: (value: unknown) => void };
type TeamInfo = {
  team: string; date: string; ordersCount: number;
  activeSession: { token: string; expiresAt: string } | null;
  disabledReason: string | null;
};
type PointInfo = {
  id: string; name: string; state: "MATCH" | "AMBIGUOUS" | "OUTSIDE";
  orderLabel: string | null;
};
type Preview = { total: number; examined: number; matched: number; unclear: number; outside: number; points: PointInfo[] };
type Bootstrap = { workspaceId: string; platformName: string; workspaceName: string; description: string };
type License = { appId: string; appKey: string; license: string };
type MapConfig = { workspaceId: string; groupId: string; autoImportEnabled: boolean };

function bridge(): DjiBridge | null { return (window as DjiWindow).djiBridge || null; }
function reply(value: unknown): BridgeResult {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as BridgeResult : {};
    } catch { return {}; }
  }
  return value && typeof value === "object" ? value as BridgeResult : {};
}
function truthy(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const data = reply(value).data;
  if (typeof data === "boolean") return data;
  if (data === "true") return true;
  if (data === "false") return false;
  return null;
}
function assertDji(result: unknown, step: string) {
  const r = reply(result);
  if (r.code !== 0) throw new Error(`${step} nicht erfolgreich (DJI-Code ${r.code ?? "unbekannt"}).`);
}
// DJI_VERIFIED_MAIN_V2: Lizenzaufruf ist nicht mit erfolgreicher Verifizierung gleichzusetzen.
function djiVerified(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const parsed = reply(raw);
  if (typeof parsed.code === "number" && parsed.code !== 0) return false;
  const data = parsed.data;
  if (typeof data === "boolean") return data;
  if (data === "true") return true;
  if (data && typeof data === "object") {
    const nested = data as { verified?: unknown; isVerified?: unknown };
    if (typeof nested.verified === "boolean") return nested.verified;
    if (typeof nested.isVerified === "boolean") return nested.isVerified;
  }
  return false;
}
async function waitForVerifiedApp(dji: DjiBridge): Promise<void> {
  if (!dji.platformIsVerified) {
    throw new Error("DJI kann den App-Verifizierungsstatus nicht abfragen.");
  }
  for (let attempt = 0; attempt < 11; attempt += 1) {
    if (djiVerified(dji.platformIsVerified())) return;
    if (attempt < 10) await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DJI meldet die App noch als unverifiziert. Bitte in Technik und Fehlersuche die Lizenz prüfen.");
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Server antwortet HTTP ${res.status}.`);
  return data;
}
function post(token: string): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) };
}
function connectionState(): "VERBUNDEN" | "UNVOLLSTAENDIG" | "UNBEKANNT" {
  const b = bridge();
  if (!b) return "UNBEKANNT";
  try {
    const ws = b.wsGetConnectState ? truthy(b.wsGetConnectState()) : null;
    const map = b.platformIsComponentLoaded ? truthy(b.platformIsComponentLoaded("map")) : null;
    if (ws === true && map === true) return "VERBUNDEN";
    if (ws === false || map === false) return "UNVOLLSTAENDIG";
  } catch { /* DJi firmware may not expose readable state */ }
  return "UNBEKANNT";
}

export default function PilotSimpleClient() {
  const { data: session, status: auth } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<TeamInfo | null>(null);
  const [token, setToken] = useState("");
  const [phase, setPhase] = useState("Noch nicht verbunden");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const user = session?.user as { role?: string; isAdmin?: boolean } | undefined;
  const allowed = Boolean(user?.isAdmin || user?.role === "PILOT");

  useEffect(() => {
    if (auth !== "authenticated" || !allowed) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api<TeamInfo>("/api/dji/pilot2/team-connect").then((data) => {
      if (cancelled) return;
      setInfo(data);
      setToken(data.activeSession?.token || "");
      if (data.activeSession) {
        const state = connectionState();
        setPhase(state === "VERBUNDEN"
          ? "DJI-Verbindung weiterhin aktiv"
          : state === "UNVOLLSTAENDIG"
            ? "Sitzung wiederhergestellt – DJI bei Bedarf erneut verbinden"
            : "Sitzung wiederhergestellt – DJI-Status nicht eindeutig");
      }
    }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Tagesplanung konnte nicht geladen werden."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auth, allowed]);

  async function login() {
    if (busy || !email.trim() || !password) return;
    setBusy(true); setError("");
    try {
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false });
      setPassword("");
      if (!result || result.error) throw new Error("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.");
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  async function startConnection() {
    if (busy || !info || info.disabledReason) return;
    setBusy(true); setError("");
    try {
      const b = bridge();
      if (!b?.platformVerifyLicense || !b.platformLoadComponent || !b.platformSetWorkspaceId || !b.platformSetInformation) {
        throw new Error("Bitte in DJI Pilot 2 unter Cloud-Dienst → Offene Plattformen öffnen.");
      }
      if (window.location.protocol !== "https:") throw new Error("Für DJI wird HTTPS benötigt.");
      const sessionToken = token || (await api<{ token: string }>("/api/dji/pilot2/team-connect", { method: "POST" })).token;
      setToken(sessionToken);
      setPhase("DJI-Lizenz wird geprüft …");
      const license = await api<License>("/api/dji/pilot2/bridge-license");
      const workspace = await api<Bootstrap>("/api/dji/pilot2/bridge-bootstrap", post(sessionToken));
      assertDji(b.platformVerifyLicense(license.appId, license.appKey, license.license), "DJI-Lizenz");
      setPhase("DJI-App-Verifizierung wird bestätigt …");
      await waitForVerifiedApp(b);
      setPhase("API und Workspace werden eingerichtet …");
      assertDji(b.platformLoadComponent("api", JSON.stringify({ host: window.location.origin + "/", token: sessionToken })), "API-Modul");
      assertDji(b.platformSetWorkspaceId(workspace.workspaceId), "Workspace");
      assertDji(b.platformSetInformation(workspace.platformName, workspace.workspaceName, workspace.description), "Workspace-Informationen");
      setPhase("WebSocket wird verbunden …");
      const socket = await api<{ wsUrl: string }>("/api/dji/pilot2/ws-bootstrap", post(sessionToken));
      // Callback does not log or display potentially sensitive DJI values.
      (window as DjiWindow).rehkitzQuickWsCallback = () => {};
      assertDji(b.platformLoadComponent("ws", JSON.stringify({
        host: socket.wsUrl, token: sessionToken, connectCallback: "rehkitzQuickWsCallback",
      })), "WebSocket-Modul");
      // DJI websocket handshake may finish asynchronously. Wait before loading the map.
      for (let i = 0; i < 20 && b.wsGetConnectState && truthy(b.wsGetConnectState()) !== true; i++) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      if (b.wsGetConnectState && truthy(b.wsGetConnectState()) === false) {
        throw new Error("WebSocket noch nicht verbunden. Bitte nach einigen Sekunden erneut 'Einsatz verbinden' tippen.");
      }
      setPhase("Kartenmodul wird aktiviert …");
      const map = await api<MapConfig>("/api/dji/pilot2/map-bootstrap", post(sessionToken));
      if (map.autoImportEnabled) throw new Error("Autoimport muss für diesen Test deaktiviert bleiben.");
      const response = await fetch(`/map/api/v1/workspaces/${encodeURIComponent(map.workspaceId)}/element-groups`, {
        credentials: "same-origin", cache: "no-store", headers: { "x-auth-token": sessionToken },
      });
      if (!response.ok) throw new Error(`Karten-API HTTP ${response.status}.`);
      const groups = await response.json() as { code?: number; data?: { id?: string; type?: number }[] };
      if (groups.code !== 0 || !groups.data?.some((g) => g.id === map.groupId && g.type === 2)) {
        throw new Error("Die DJI-Kartenebene wurde nicht gefunden.");
      }
      assertDji(b.platformLoadComponent("map", JSON.stringify({})), "Kartenmodul");
      const loaded = b.platformIsComponentLoaded ? truthy(b.platformIsComponentLoaded("map")) : null;
      if (loaded === false) throw new Error("DJI meldet das Kartenmodul noch nicht als aktiv. Bitte erneut verbinden.");
      setPhase("Verbunden – du kannst jetzt zu DJI Pilot 2 wechseln");
    } catch (e) {
      setError(e instanceof Error ? e.message : "DJI-Verbindung fehlgeschlagen.");
      setPhase("Verbindung nicht vollständig eingerichtet");
    } finally { setBusy(false); }
  }

  async function checkPoints() {
    if (busy || !token) return;
    setBusy(true); setError("");
    try { setPreview(await api<Preview>("/api/dji/pilot2/point-preview")); }
    catch (e) { setError(e instanceof Error ? e.message : "GPS-Vorschau fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  async function endSession() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api<{ success: boolean }>("/api/dji/pilot2/team-connect", { method: "DELETE" });
      try { bridge()?.wsDisconnect?.(); } catch { /* No active webview bridge */ }
      setToken(""); setPreview(null); setPhase("DJI-Sitzung beendet");
      setInfo((old) => old ? { ...old, activeSession: null } : null);
    } catch (e) { setError(e instanceof Error ? e.message : "Beenden fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-5 text-slate-900">
      <header className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center shadow-sm">
        <h1 className="text-2xl font-bold leading-tight">Rehkitzrettung<br /><span className="text-xl">Hegering Hittfeld</span></h1>
        <p className="mt-2 text-sm text-slate-600">DJI-Einsatzverbindung</p>
      </header>
      {auth === "loading" || loading && auth === "authenticated" ? (
        <section className="rounded-2xl border bg-white p-5">Einsatzdaten werden geladen …</section>
      ) : auth === "unauthenticated" ? (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">Als Pilot anmelden</h2>
          <label className="block text-sm">E-Mail
            <input autoComplete="username" type="email" className="mt-1 w-full rounded-lg border p-3" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">Passwort
            <input autoComplete="current-password" type="password" className="mt-1 w-full rounded-lg border p-3" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void login(); }} />
          </label>
          <button type="button" className="w-full rounded-xl bg-slate-900 p-4 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void login()}>Anmelden</button>
        </section>
      ) : !allowed ? (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Als Pilot anmelden</h2>
          <p>Auf dieser Fernsteuerung ist bereits ein Benutzer angemeldet, der derzeit nicht als Pilot oder Administrator erkannt wird.</p>
          <p className="text-sm">{session?.user?.email || session?.user?.name || "Angemeldetes Konto"}</p>
          <p>Bitte melde dieses Konto ab. Danach kannst du dich mit deinem Piloten-Konto anmelden.</p>
          <button type="button" className="w-full rounded-xl bg-slate-900 p-4 font-semibold text-white" onClick={() => void signOut({ callbackUrl: "/pilot-login" })}>
            Abmelden und als Pilot anmelden
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div><p className="font-semibold">Pilot angemeldet</p><p className="text-sm text-slate-600">{session?.user?.name || session?.user?.email}</p></div>
              <button type="button" onClick={() => void signOut({ callbackUrl: "/pilot-login" })} className="rounded-lg border px-3 py-2 text-sm">Abmelden</button>
            </div>
            {info && <div className="rounded-lg bg-slate-100 p-3 text-sm">
              <p><strong>Einsatztag:</strong> {info.date}</p>
              <p><strong>Team:</strong> {info.team}</p>
              <p><strong>Tagesaufträge:</strong> {info.ordersCount}</p>
            </div>}
            {info?.disabledReason && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950" role="alert">{info.disabledReason}</p>}
            <button type="button" disabled={busy || !info || Boolean(info.disabledReason)} onClick={() => void startConnection()}
              className="w-full rounded-xl bg-emerald-700 px-4 py-5 text-lg font-bold text-white disabled:opacity-50">
              {busy ? "DJI wird vorbereitet …" : "Einsatz verbinden"}
            </button>
            <p className="rounded-lg bg-slate-100 p-3 text-center text-sm" role="status">{phase}</p>
            <p className="text-center text-xs text-slate-600">Danach in DJI Pilot 2 wechseln und Kartenmarkierungen setzen.</p>
          </section>
          <section className="space-y-3 rounded-2xl border bg-white p-4">
            <h2 className="font-semibold">GPS-Zuordnung kontrollieren</h2>
            <p className="text-sm text-slate-600">DJI-Punkte werden probeweise den Flächen deines Teams zugeordnet. Noch keine echten Auftrags-PinPoints.</p>
            <button type="button" disabled={busy || !token} className="w-full rounded-lg border p-3 font-semibold disabled:opacity-50" onClick={() => void checkPoints()}>
              Empfangene Punkte prüfen
            </button>
            {preview && <div className="space-y-2 text-sm">
              <p><strong>{preview.matched}</strong> eindeutig zugeordnet · <strong>{preview.unclear}</strong> unklar · <strong>{preview.outside}</strong> außerhalb</p>
              <p className="text-xs text-slate-500">{preview.examined} von {preview.total} Punkten betrachtet (max. 50).</p>
              <ul className="space-y-2">{preview.points.slice(0, 10).map((p) => <li key={p.id} className="rounded-lg bg-slate-50 p-2">
                <strong>{p.name}</strong> – {p.state === "MATCH" ? p.orderLabel : p.state === "AMBIGUOUS" ? "Mehrere passende Aufträge" : "Außerhalb der Auftragsflächen"}
              </li>)}</ul>
            </div>}
          </section>
          <details className="rounded-2xl border bg-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Technik und Fehlersuche (PIN-geschützt)</summary>
            <div className="mt-3 space-y-3">
              <p>Bei Verbindungsproblemen stehen die bisherigen DJI-Einzeltests weiterhin zur Verfügung.</p>
              {user?.isAdmin ? <a className="block underline" href="/pilot-login/technik">Technische Testansicht öffnen (Demo-/GPS-Test-PIN)</a> : <p>Technikzugang nur für Administratoren.</p>}
              <button type="button" disabled={busy || !token} onClick={() => void endSession()} className="rounded-lg border border-rose-300 px-3 py-2 disabled:opacity-50">DJI-Sitzung beenden</button>
            </div>
          </details>
        </>
      )}
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">{error}</p>}
      <p className="text-center text-xs text-slate-500">Die bisherigen Flächen- und Gesamteinsatz-Timer bleiben unverändert.</p>
    </main>
  );
}
