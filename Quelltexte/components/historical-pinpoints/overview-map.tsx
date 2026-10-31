"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import HistoricalMarkers from "./historical-markers";
import type { HistoricalPinpoint } from "./types";

function FitToHistory({ points }: { points: HistoricalPinpoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export default function HistoricalOverviewMap({ points }: { points: HistoricalPinpoint[] }) {
  return (
    <div className="h-[65vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-gray-200">
      <MapContainer className="h-full w-full" center={[53.36, 9.99]} zoom={12} scrollWheelZoom>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles © Esri"
          maxZoom={20}
        />
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          attribution="Labels © Esri"
          maxZoom={20}
          pane="overlayPane"
        />
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution="Labels © Esri"
          maxZoom={20}
          pane="overlayPane"
        />
        <FitToHistory points={points} />
        <HistoricalMarkers points={points} />
      </MapContainer>
    </div>
  );
}
