"use client";

import { useMemo } from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { HistoricalPinpoint } from "./types";

// REHKITZ_HISTORICAL_PINPOINT_COLORS_V2
// Ein historischer PinPoint kann mehrere Fundarten enthalten.
// Dann zeigt ein mehrfarbiger Kreis alle vorhandenen Kategorien gleichzeitig.
const COLORS = {
  kitzGesichert: "#16a34a",           // gruen
  kitzAbgesprungen: "#f97316",        // orange
  sonstigesGesichert: "#2563eb",      // blau
  sonstigesAbgesprungen: "#dc2626",  // rot
  fehlstelle: "#a16207",             // braun
} as const;

const LEGEND = [
  { label: "Rehkitz gesichert", color: COLORS.kitzGesichert },
  { label: "Rehkitz abgesprungen", color: COLORS.kitzAbgesprungen },
  { label: "Sonstiges Wild gesichert", color: COLORS.sonstigesGesichert },
  { label: "Sonstiges Wild abgesprungen", color: COLORS.sonstigesAbgesprungen },
  { label: "Maulwurfshügel / Fehlstelle", color: COLORS.fehlstelle },
];

function categories(point: HistoricalPinpoint): string[] {
  const colors: string[] = [];
  if (point.rehkitzeGesichert > 0) colors.push(COLORS.kitzGesichert);
  if (point.rehkitzeAbgesprungen > 0) colors.push(COLORS.kitzAbgesprungen);
  if (point.sonstigesWildGesichert > 0) colors.push(COLORS.sonstigesGesichert);
  if (point.sonstigesWildAbgesprungen > 0) colors.push(COLORS.sonstigesAbgesprungen);
  if (point.maulwurfhuegelFehlstelle > 0) colors.push(COLORS.fehlstelle);
  // Sollte ein alter Datensatz keine Kategorie enthalten, bleibt die Position
  // als ungefuellter Ring sichtbar, ohne eine zusaetzliche "Kein Fund"-Kategorie.
  return colors;
}

function markerSvg(colors: string[]): string {
  const mid = 15;
  const radius = 11;
  const wedges = colors.length === 1
    ? `<circle cx="${mid}" cy="${mid}" r="${radius}" fill="${colors[0]}" />`
    : colors.map((color, index) => {
        const from = -Math.PI / 2 + (index * 2 * Math.PI / colors.length);
        const to = -Math.PI / 2 + ((index + 1) * 2 * Math.PI / colors.length);
        const x1 = mid + radius * Math.cos(from);
        const y1 = mid + radius * Math.sin(from);
        const x2 = mid + radius * Math.cos(to);
        const y2 = mid + radius * Math.sin(to);
        const largeArc = (to - from) > Math.PI ? 1 : 0;
        return `<path d="M ${mid} ${mid} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z" fill="${color}" stroke="#ffffff" stroke-width="0.8" />`;
      }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <circle cx="15" cy="15" r="14" fill="#ffffff" opacity="0.92" />
    ${wedges}
    <circle cx="15" cy="15" r="11.7" stroke="#ffffff" stroke-width="1.7" fill="none" />
    <circle cx="15" cy="15" r="13.5" stroke="#374151" stroke-opacity="0.7" stroke-width="0.8" fill="none" />
  </svg>`;
}

function iconFor(point: HistoricalPinpoint): L.DivIcon {
  return L.divIcon({
    className: "rehkitz-historical-multicolor-pin",
    html: markerSvg(categories(point)),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -12],
  });
}

export function HistoricalPinpointLegend() {
  return (
    <div className="mt-2 space-y-2 text-xs text-gray-800" aria-label="Farblegende historische PinPoints">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-white ring-1 ring-gray-400" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="text-gray-600">Mehrfarbiger Kreis = mehrere Fundarten am selben PinPoint. Alle historischen Punkte bleiben sichtbar.</p>
    </div>
  );
}

export default function HistoricalMarkers({ points }: { points: HistoricalPinpoint[] }) {
  const markers = useMemo(() => points.map((point) => ({ point, icon: iconFor(point) })), [points]);
  return <>
    {markers.map(({point, icon}) => (
      <Marker key={`history-${point.id}`} position={[point.latitude, point.longitude]} icon={icon}>
        <Popup>
          <div className="min-w-[200px] space-y-1 text-sm">
            <div className="font-bold text-gray-900">Historischer PinPoint · {point.season}</div>
            <div>{new Date(`${point.date}T12:00:00`).toLocaleDateString("de-DE")}</div>
            <div><strong>Fläche:</strong> {point.fieldLabel}</div>
            <div><strong>Auftrag:</strong> {point.orderLabel}</div>
            <div><strong>PinPoint:</strong> {point.sequenceNumber} ({point.status})</div>
            <div><span style={{ color: COLORS.kitzGesichert }}>●</span> Rehkitze gesichert: {point.rehkitzeGesichert}</div>
            <div><span style={{ color: COLORS.sonstigesGesichert }}>●</span> Sonstiges Wild gesichert: {point.sonstigesWildGesichert}</div>
            <div><span style={{ color: COLORS.kitzAbgesprungen }}>●</span> Rehkitze abgesprungen: {point.rehkitzeAbgesprungen}</div>
            <div><span style={{ color: COLORS.sonstigesAbgesprungen }}>●</span> Sonstiges Wild abgesprungen: {point.sonstigesWildAbgesprungen}</div>
            <div><span style={{ color: COLORS.fehlstelle }}>●</span> Maulwurfshügel / Fehlstelle: {point.maulwurfhuegelFehlstelle}</div>
            <div className="text-xs text-gray-600">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</div>
            <div className="border-t pt-1 text-xs font-semibold text-gray-600">Nur Information · keine Bearbeitung</div>
          </div>
        </Popup>
      </Marker>
    ))}
  </>;
}
