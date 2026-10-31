"use client";

import { useEffect, useState } from "react";
import type { HistoricalPinpoint, HistoricalPinpointsResponse } from "./types";

export function useHistoricalPinpoints(params: { enabled: boolean; fieldId?: string; season: string }) {
  const { enabled, fieldId, season } = params;
  const [items, setItems] = useState<HistoricalPinpoint[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!enabled || fieldId === "") {
      setItems([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ season });
    if (fieldId) query.set("fieldId", fieldId);
    void fetch(`/api/historical-pinpoints?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as HistoricalPinpointsResponse;
        if (!response.ok) throw new Error(data.error || "Fehler beim Laden der historischen PinPoints.");
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setItems(data.items);
        setSeasons(data.seasons);
        setTruncated(data.truncated);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(err instanceof Error ? err.message : "Ladefehler");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, fieldId, season]);

  return { items, seasons, loading, error, truncated };
}
