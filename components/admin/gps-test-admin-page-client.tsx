"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UserOption = {
  id: string;
  firstName: string;
  lastName: string;
  role: "PILOT" | "SUCHER";
};

type DemoOrderOption = {
  id: string;
  label: string;
  pinpoint: { latitude: number; longitude: number } | null;
};

type TestSession = {
  id: string;
  date: string;
  teamName: string;
  pilot: string;
  searchers: string[];
  testOrders: number;
};

type TestData = {
  today: string;
  pilots: UserOption[];
  searchers: UserOption[];
  demoOrders: DemoOrderOption[];
  tests: TestSession[];
};

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 focus:border-blue-500 focus:outline-none";

function userName(user: UserOption) {
  return `${user.firstName} ${user.lastName}`.trim();
}

function germanDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

export default function GpsTestAdminPageClient() {
  const [data, setData] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [pilotId, setPilotId] = useState("");
  const [searcherIds, setSearcherIds] = useState<string[]>([]);
  const [demoOrderId, setDemoOrderId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/gps-test", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "GPS-Testdaten konnten nicht geladen werden.");
      setData(result as TestData);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todayTest = useMemo(
    () => data?.tests.find((test) => test.date === data.today),
    [data]
  );

  function selectDemoOrder(orderId: string) {
    setDemoOrderId(orderId);
    const order = data?.demoOrders.find((item) => item.id === orderId);
    if (order?.pinpoint) {
      setLatitude(String(order.pinpoint.latitude));
      setLongitude(String(order.pinpoint.longitude));
    } else {
      setLatitude("");
      setLongitude("");
    }
  }

  function toggleSearcher(id: string, checked: boolean) {
    setSearcherIds((old) =>
      checked ? [...old.filter((item) => item !== id), id] : old.filter((item) => item !== id)
    );
  }

  function getMyPosition() {
    setMessage(null);
    setError(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setError("GPS benötigt HTTPS oder localhost und eine Standortberechtigung.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setMessage(`GPS-Position übernommen (Genauigkeit etwa ±${Math.round(position.coords.accuracy)} m).`);
        setGpsLoading(false);
      },
      (failure) => {
        setError(
          failure.code === 1
            ? "Standortberechtigung wurde abgelehnt. Du kannst die Koordinaten auch manuell eingeben."
            : "Position nicht verfügbar. Bitte draußen erneut versuchen oder Koordinaten eingeben."
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  async function createTest() {
    setMessage(null);
    setError(null);
    if (!pilotId || !demoOrderId || searcherIds.length === 0 || searcherIds.length > 6) {
      setError("Bitte einen Piloten, einen Demoauftrag und 1 bis 6 Sucher auswählen.");
      return;
    }
    if (!latitude.trim() || !longitude.trim()) {
      setError("Bitte die Koordinaten für den Test-Pinpoint eingeben oder per GPS übernehmen.");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/admin/gps-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pilotId,
          searcherIds,
          demoOrderId,
          latitude: Number(latitude),
          longitude: Number(longitude),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "GPS-Test konnte nicht angelegt werden.");
      setMessage(result.message || "GPS-Test angelegt.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Anlegen fehlgeschlagen.");
    } finally {
      setWorking(false);
    }
  }

  async function removeTest(test: TestSession) {
    if (!window.confirm(
      `GPS-Test vom ${germanDate(test.date)} wirklich beenden?\n\nDer automatisch angelegte Testauftrag und sein Pinpoint werden gelöscht. Der ursprüngliche Demoauftrag bleibt erhalten.`
    )) return;
    setWorking(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/gps-test", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: test.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "GPS-Test konnte nicht beendet werden.");
      setMessage(result.message || "Testdaten entfernt.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Beenden fehlgeschlagen.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-6 md:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Nur für Administratoren</p>
              <h1 className="mt-1 text-2xl font-extrabold text-gray-950">🧪 GPS-Testmodus</h1>
              <p className="mt-2 text-sm text-gray-700">
                Teste die Live-Teamkarte auch außerhalb der Saison. Der Modus legt für heute ein
                eigenes Testteam und einen gekennzeichneten Demoauftrag an – ohne den Saisonkalender zu ändern.
              </p>
            </div>
            <a className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold" href="/my-orders">
              Meine Aufträge →
            </a>
          </div>
          {data && (
            <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950">
              Testdatum: {germanDate(data.today)} (heute)
            </div>
          )}
        </section>

        {message && (
          <div role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">{message}</div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
        )}

        {loading && !data ? (
          <section className="rounded-2xl bg-white p-5">Testdaten werden geladen …</section>
        ) : data ? (
          <>
            {todayTest ? (
              <section className="space-y-3 rounded-3xl border border-blue-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Testteam ist für heute eingerichtet</h2>
                <p className="text-sm text-gray-700">{todayTest.teamName}</p>
                <p className="text-sm text-gray-700">
                  <strong>Pilot:</strong> {todayTest.pilot}
                  <span className="mx-2 text-gray-400">·</span>
                  <strong>Sucher:</strong> {todayTest.searchers.join(", ")}
                </p>
                <p className="text-sm text-gray-700">Ein eigener GPS-Testauftrag mit PinPoint 1 wurde angelegt.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <a href="/my-orders" className="rounded-xl bg-blue-700 px-4 py-3 text-center text-sm font-bold text-white">
                    Zu „Meine Aufträge“
                  </a>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => { void removeTest(todayTest); }}
                    className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 disabled:opacity-50"
                  >
                    Test beenden und Testdaten entfernen
                  </button>
                </div>
              </section>
            ) : (
              <section className="space-y-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Neuen Test für heute einrichten</h2>
                <div>
                  <label htmlFor="gps-test-pilot" className="mb-1 block text-sm font-bold text-gray-900">Pilot</label>
                  <select id="gps-test-pilot" value={pilotId} onChange={(event) => setPilotId(event.target.value)} className={inputClass}>
                    <option value="">Piloten auswählen …</option>
                    {data.pilots.map((pilot) => (
                      <option key={pilot.id} value={pilot.id}>{userName(pilot)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-900">Sucher (1–6 Helfer)</label>
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-300 p-3">
                    {data.searchers.length === 0 ? (
                      <p className="text-sm text-gray-600">Keine zugelassenen Sucher vorhanden.</p>
                    ) : (
                      data.searchers.map((searcher) => (
                        <label key={searcher.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={searcherIds.includes(searcher.id)}
                            onChange={(event) => toggleSearcher(searcher.id, event.target.checked)}
                            disabled={!searcherIds.includes(searcher.id) && searcherIds.length >= 6}
                            className="h-5 w-5"
                          />
                          <span className="text-sm text-gray-900">{userName(searcher)}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{searcherIds.length} Sucher ausgewählt. Die Helfer müssen sich später jeweils selbst anmelden und ihre GPS-Freigabe einschalten.</p>
                </div>
                <div>
                  <label htmlFor="gps-test-order" className="mb-1 block text-sm font-bold text-gray-900">Vorhandener Demoauftrag als Vorlage</label>
                  <select id="gps-test-order" value={demoOrderId} onChange={(event) => selectDemoOrder(event.target.value)} className={inputClass}>
                    <option value="">Demoauftrag auswählen …</option>
                    {data.demoOrders.map((order) => (
                      <option key={order.id} value={order.id}>{order.label}</option>
                    ))}
                  </select>
                  {data.demoOrders.length === 0 && (
                    <p className="mt-2 text-sm font-semibold text-orange-800">
                      Kein Demoauftrag vorhanden. Lege zuerst wie bisher einen Demoauftrag an und lade diese Seite neu.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-600">Der ausgewählte Demoauftrag wird nur als Vorlage verwendet und nicht verändert.</p>
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-bold text-gray-900">Test-Pinpoint (GPS-Koordinaten)</label>
                    <button type="button" onClick={getMyPosition} disabled={gpsLoading} className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 disabled:opacity-50">
                      {gpsLoading ? "GPS wird ermittelt …" : "📍 Meinen Standort übernehmen"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="gps-test-lat" className="mb-1 block text-xs font-semibold text-gray-700">Breitengrad</label>
                      <input id="gps-test-lat" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="53.123456" className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="gps-test-lon" className="mb-1 block text-xs font-semibold text-gray-700">Längengrad</label>
                      <input id="gps-test-lon" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="9.123456" className={inputClass} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    Diese Position wird als Test-Pinpoint 1 angelegt. Falls der Demoauftrag bereits einen Pinpoint enthält, werden dessen Koordinaten zunächst vorgeschlagen.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={working || !pilotId || !demoOrderId || searcherIds.length === 0 || !latitude || !longitude}
                  onClick={() => { void createTest(); }}
                  className="w-full rounded-xl bg-black px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {working ? "Test wird eingerichtet …" : "🧪 GPS-Testteam und Demoauftrag anlegen"}
                </button>
              </section>
            )}
            {data.tests.filter((test) => test.date !== data.today).length > 0 && (
              <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                <h2 className="text-base font-bold text-gray-900">Ältere Testteams entfernen</h2>
                {data.tests.filter((test) => test.date !== data.today).map((test) => (
                  <div key={test.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                    <div className="text-sm text-gray-800">
                      <strong>{germanDate(test.date)}</strong> · {test.teamName} · {test.pilot}
                    </div>
                    <button type="button" disabled={working} onClick={() => { void removeTest(test); }} className="rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">
                      Test entfernen
                    </button>
                  </div>
                ))}
              </section>
            )}
            <section className="rounded-2xl border border-gray-200 bg-gray-100 p-4 text-sm text-gray-700">
              <strong>Testablauf:</strong> Öffne auf zwei Smartphones mit unterschiedlichen Helferkonten „Meine Aufträge“, wähle heute aus und starte die freiwillige Standortfreigabe. Öffne dann den Testauftrag, PinPoint 1 und „Navigation starten“. Auf der Karte sollten P1, S1 usw. erscheinen. Die Smartphones benötigen HTTPS und Standortberechtigung. Es werden keine Push- oder E-Mail-Benachrichtigungen verschickt.
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
