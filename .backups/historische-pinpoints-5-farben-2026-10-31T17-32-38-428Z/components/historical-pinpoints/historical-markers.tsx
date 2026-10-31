"use client";

import { CircleMarker, Popup } from "react-leaflet";
import type { HistoricalPinpoint } from "./types";

export default function HistoricalMarkers({ points }: { points: HistoricalPinpoint[] }) {
  return <>
    {points.map((point) => (
      <CircleMarker
        key={`history-${point.id}`}
        center={[point.latitude, point.longitude]}
        radius={7}
        pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#7c3aed", fillOpacity: 0.95 }}
      >
        <Popup>
          <div className="min-w-[190px] space-y-1 text-sm">
            <div className="font-bold text-violet-800">Historischer PinPoint · {point.season}</div>
            <div>{new Date(`${point.date}T12:00:00`).toLocaleDateString("de-DE")}</div>
            <div><strong>Fläche:</strong> {point.fieldLabel}</div>
            <div><strong>Auftrag:</strong> {point.orderLabel}</div>
            <div><strong>PinPoint:</strong> {point.sequenceNumber} ({point.status})</div>
            <div>Rehkitze gesichert: {point.rehkitzeGesichert}</div>
            <div>Rehkitze abgesprungen: {point.rehkitzeAbgesprungen}</div>
            <div>Sonstiges Wild gesichert: {point.sonstigesWildGesichert}</div>
            <div>Sonstiges Wild abgesprungen: {point.sonstigesWildAbgesprungen}</div>
            <div>Maulwurfhügel / Fehlstelle: {point.maulwurfhuegelFehlstelle}</div>
            <div className="text-xs text-gray-600">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</div>
            <div className="border-t pt-1 text-xs font-semibold text-violet-700">Nur Information · keine Bearbeitung</div>
          </div>
        </Popup>
      </CircleMarker>
    ))}
  </>;
}
