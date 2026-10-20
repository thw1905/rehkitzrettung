// Speichern als: components/orders/use-team-live-location.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TeamLocationMember = {
  userId: string;
  name: string;
  role: "PILOT" | "SUCHER";
  markerCode: string;
  markerColor: string;
  sharingEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  positionAt: string | null;
  stale: boolean;
};

export type OwnGpsPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type TeamLocationsResponse = {
  myUserId?: string;
  members?: TeamLocationMember[];
  error?: string;
};

export function useTeamLiveLocation(params: {
  date: string;
  teamId: string | null;
  navigationOpen: boolean;
}) {
  const { date, teamId, navigationOpen } = params;
  const [sharing, setSharing] = useState(false);
  const [members, setMembers] = useState<TeamLocationMember[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [ownPosition, setOwnPosition] = useState<OwnGpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const latestFixRef = useRef<{ fix: GeolocationPosition; at: number } | null>(null);
  const sentFixAtRef = useRef(0);
  const sendingRef = useRef(false);
  const inFlightSendRef = useRef<Promise<void> | null>(null);
  const sharingRef = useRef(false);
  const dateRef = useRef(date);
  const sharingDateRef = useRef<string | null>(null);
  const teamRef = useRef(teamId);
  dateRef.current = date;
  teamRef.current = teamId;

  const currentDate = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();
  const canUseToday = date === currentDate && !!teamId;

  const stopSharing = useCallback(async () => {
    sharingRef.current = false;
    setSharing(false);
    setOwnPosition(null);
    latestFixRef.current = null;
    sentFixAtRef.current = 0;
    const activeDate = sharingDateRef.current;
    if (!activeDate) return;
    sharingDateRef.current = null;
    try {
      // Erst den laufenden Standort-Upload beenden, dann serverseitig löschen.
      // Anderenfalls könnte ein später eintreffender Upload die Freigabe
      // unmittelbar nach dem Ausschalten wieder aktivieren.
      await inFlightSendRef.current?.catch(() => {});
      const response = await fetch("/api/team-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", date: activeDate }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Standortfreigabe konnte nicht vollständig beendet werden.");
    } catch (error) {
      console.error("Standortfreigabe beenden:", error);
      setError("Standortfreigabe konnte serverseitig nicht beendet werden. Bitte erneut versuchen.");
    }
  }, []);

  const startSharing = useCallback(() => {
    if (!teamRef.current || dateRef.current !== currentDate) {
      setError("Live-Ortung ist nur für dein Team am heutigen Einsatztag möglich.");
      return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      setError("Für die Freigabe sind HTTPS und eine GPS-Standortberechtigung nötig.");
      return;
    }
    latestFixRef.current = null;
    sentFixAtRef.current = 0;
    setError(null);
    sharingDateRef.current = dateRef.current;
    sharingRef.current = true;
    setSharing(true);
  }, [currentDate]);

  // Sicherheitsnetz beim Verlassen der Einsatzseite oder Schließen des Tabs.
  // Auf Smartphones ist pagehide nicht immer garantiert. Stale-Werte werden
  // nach 60 Sekunden vom Server nicht mehr an andere Helfer ausgegeben.
  useEffect(() => {
    const stopOnPageHide = () => {
      if (!sharingRef.current) return;
      sharingRef.current = false;
      void fetch("/api/team-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", date: sharingDateRef.current }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", stopOnPageHide);
    return () => {
      window.removeEventListener("pagehide", stopOnPageHide);
      stopOnPageHide();
    };
  }, []);

  useEffect(() => {
    if (!sharing) return;
    if (!canUseToday) {
      // Eine Änderung des angezeigten Datums oder die Entfernung aus dem
      // Team darf keine weiterhin laufende GPS-Aufzeichnung hinterlassen.
      void stopSharing();
      return;
    }

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) return;
        setOwnPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
        latestFixRef.current = { fix: position, at: position.timestamp };
        if (position.coords.accuracy > 150) {
          setError(`GPS noch zu ungenau (±${Math.round(position.coords.accuracy)} m). Warte auf besseren Empfang.`);
        } else {
          setError(null);
        }
      },
      (geolocationError) => {
        if (cancelled) return;
        const message = geolocationError.code === 1
          ? "Standortberechtigung wurde nicht erteilt."
          : "GPS momentan nicht verfügbar. Prüfe die Standortfreigabe.";
        setError(message);
        if (geolocationError.code === 1) void stopSharing();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    const tick = async () => {
      const latest = latestFixRef.current;
      if (!latest || sendingRef.current || cancelled) return;
      if (latest.at <= sentFixAtRef.current) return;
      if (Date.now() - latest.at > 15_000) return;
      const fix = latest.fix;
      if (!Number.isFinite(fix.coords.accuracy) || fix.coords.accuracy > 150) return;
      sendingRef.current = true;
      const sending = (async () => {
      try {
        const response = await fetch("/api/team-locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            action: "position",
            date,
            teamId,
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
            accuracy: fix.coords.accuracy,
            fixTimestamp: latest.at,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "GPS-Standort konnte nicht übertragen werden.");
        }
        sentFixAtRef.current = latest.at;
        if (!cancelled) setError(null);
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "GPS-Übertragung fehlgeschlagen.");
        }
      } finally {
        sendingRef.current = false;
      }
      })();
      inFlightSendRef.current = sending;
      await sending;
      if (inFlightSendRef.current === sending) inFlightSendRef.current = null;
    };
    void tick();
    const interval = window.setInterval(() => { void tick(); }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      navigator.geolocation.clearWatch(watchId);
      latestFixRef.current = null;
    };
  }, [sharing, canUseToday, teamId, date, stopSharing]);

  useEffect(() => {
    if (!navigationOpen || !canUseToday) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    let pending = false;
    setLoadingTeam(true);
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(
          `/api/team-locations?date=${encodeURIComponent(date)}&teamId=${encodeURIComponent(teamId!)}`,
          { cache: "no-store" }
        );
        const data: TeamLocationsResponse = await response.json();
        if (!response.ok) throw new Error(data.error || "Teamstandorte konnten nicht geladen werden.");
        if (cancelled) return;
        setMembers(data.members || []);
        setMyUserId(data.myUserId || null);
        setError((old) => old?.startsWith("Teamstandorte") ? null : old);
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Teamstandorte nicht erreichbar.");
      } finally {
        pending = false;
        if (!cancelled) setLoadingTeam(false);
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [navigationOpen, canUseToday, date, teamId]);

  return {
    sharing,
    members,
    myUserId,
    ownPosition,
    error,
    loadingTeam,
    canUseToday,
    startSharing,
    stopSharing,
  };
}
