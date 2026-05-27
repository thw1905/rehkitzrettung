"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type AreaFeature =
  | GeoJSON.Feature<GeoJSON.Polygon>
  | GeoJSON.Feature<GeoJSON.MultiPolygon>;

type Revier = {
  id: string;
  label: string;
  areaGeoJson: AreaFeature;
};

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: AreaFeature;
  areaHa: number;
  overlapHa: number;
  overlapPercent: number;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
  owner?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

type PreparedPolygon = {
  id: string;
  label: string;
  rings: [number, number][][];
};

type Props = {
  revier: Revier;
  fields: FieldItem[];
};

function getFieldLabel(field: FieldItem) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getOwnerName(field: FieldItem) {
  if (!field.owner) return "-";

  return (
    [field.owner.firstName || "", field.owner.lastName || ""].join(" ").trim() ||
    "-"
  );
}

function formatHa(value: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function ringToPositions(ring: any): [number, number][] {
  if (!Array.isArray(ring)) return [];

  return ring
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;

      const [lng, lat] = coord;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return [lat, lng] as [number, number];
    })
    .filter(Boolean) as [number, number][];
}

function areaFeatureToRings(feature?: AreaFeature | null): [number, number][][] {
  try {
    if (!feature?.geometry) return [];

    if (feature.geometry.type === "Polygon") {
      const outerRing = feature.geometry.coordinates?.[0];
      const positions = ringToPositions(outerRing);
      return positions.length >= 3 ? [positions] : [];
    }

    if (feature.geometry.type === "MultiPolygon") {
      return (feature.geometry.coordinates || [])
        .map((polygonCoords) => ringToPositions(polygonCoords?.[0]))
        .filter((positions) => positions.length >= 3);
    }

    return [];
  } catch {
    return [];
  }
}

function getCenterFromRings(rings: [number, number][][]): [number, number] | null {
  const bounds = L.latLngBounds([]);

  for (const ring of rings) {
    for (const pos of ring) {
      bounds.extend(pos);
    }
  }

  if (!bounds.isValid()) return null;

  const center = bounds.getCenter();
  return [center.lat, center.lng];
}

function buildBounds(params: {
  revierRings: [number, number][][];
  fieldPolygons: PreparedPolygon[];
  fields: FieldItem[];
}) {
  const bounds = L.latLngBounds([]);

  for (const ring of params.revierRings) {
    for (const pos of ring) {
      bounds.extend(pos);
    }
  }

  for (const polygon of params.fieldPolygons) {
    for (const ring of polygon.rings) {
      for (const pos of ring) {
        bounds.extend(pos);
      }
    }
  }

  for (const field of params.fields) {
    if (
      typeof field.locationLatitude === "number" &&
      typeof field.locationLongitude === "number"
    ) {
      bounds.extend([field.locationLatitude, field.locationLongitude]);
    }
  }

  return bounds;
}

function FitMapToData({
  revierRings,
  fieldPolygons,
  fields,
}: {
  revierRings: [number, number][][];
  fieldPolygons: PreparedPolygon[];
  fields: FieldItem[];
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = buildBounds({ revierRings, fieldPolygons, fields });

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [24, 24],
      });
    }
  }, [map, revierRings, fieldPolygons, fields]);

  return null;
}

function PrintFitController({
  revierRings,
  fieldPolygons,
  fields,
}: {
  revierRings: [number, number][][];
  fieldPolygons: PreparedPolygon[];
  fields: FieldItem[];
}) {
  const map = useMap();
  const previousViewRef = useRef<{
    center: L.LatLng;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    function fitForPrint() {
      const bounds = buildBounds({ revierRings, fieldPolygons, fields });

      if (!bounds.isValid()) return;

      previousViewRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
      };

      map.invalidateSize();

      map.fitBounds(bounds, {
        padding: [18, 18],
        maxZoom: 17,
        animate: false,
      });

      window.setTimeout(() => {
        map.invalidateSize();

        map.fitBounds(bounds, {
          padding: [18, 18],
          maxZoom: 17,
          animate: false,
        });
      }, 250);

      window.setTimeout(() => {
        map.invalidateSize();
      }, 650);
    }

    function restoreAfterPrint() {
      const previous = previousViewRef.current;

      if (!previous) return;

      map.setView(previous.center, previous.zoom, {
        animate: false,
      });

      previousViewRef.current = null;

      window.setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    window.addEventListener("prepare-revier-print", fitForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);

    return () => {
      window.removeEventListener("prepare-revier-print", fitForPrint);
      window.removeEventListener("afterprint", restoreAfterPrint);
    };
  }, [map, revierRings, fieldPolygons, fields]);

  return null;
}

export default function RevierMapLeaflet({ revier, fields }: Props) {
  const revierRings = useMemo(
    () => areaFeatureToRings(revier.areaGeoJson),
    [revier.areaGeoJson]
  );

  const fieldPolygons = useMemo(
    () =>
      fields
        .map((field) => ({
          id: field.id,
          label: getFieldLabel(field),
          rings: areaFeatureToRings(field.areaGeoJson),
        }))
        .filter((field) => field.rings.length > 0),
    [fields]
  );

  const defaultCenter: [number, number] =
    getCenterFromRings(revierRings) || revierRings[0]?.[0] || [53.36, 9.99];

  const mapKey = `revier-map-${revier.id}-${fields.length}`;

  return (
    <div className="revier-print-map h-[520px] w-full overflow-hidden rounded-2xl border border-gray-200 print:h-[145mm] print:rounded-none print:border-gray-400">
      <MapContainer
        key={mapKey}
        className="h-full w-full"
        center={defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles © Esri"
          maxZoom={20}
        />

        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          attribution="Transportation © Esri"
          maxZoom={20}
          pane="overlayPane"
        />
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution="Labels © Esri"
          maxZoom={20}
          pane="overlayPane"
        />

        <FitMapToData
          revierRings={revierRings}
          fieldPolygons={fieldPolygons}
          fields={fields}
        />

        <PrintFitController
          revierRings={revierRings}
          fieldPolygons={fieldPolygons}
          fields={fields}
        />

        {revierRings.map((positions, index) => (
          <Polygon
            key={`${revier.id}-ring-${index}`}
            positions={positions}
            pathOptions={{
              color: "#1d4ed8",
              weight: 4,
              fillColor: "#2563eb",
              fillOpacity: 0.12,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-bold">Revier</div>
                <div>{revier.label}</div>
              </div>
            </Popup>
          </Polygon>
        ))}

        {fieldPolygons.map((fieldPolygon) => {
          const field = fields.find((item) => item.id === fieldPolygon.id);
          if (!field) return null;

          return (
            <div key={fieldPolygon.id}>
              {fieldPolygon.rings.map((positions, index) => (
                <Polygon
                  key={`${fieldPolygon.id}-ring-${index}`}
                  positions={positions}
                  pathOptions={{
                    color: "#f97316",
                    weight: 3,
                    fillColor: "#fb923c",
                    fillOpacity: 0.28,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-bold">{getFieldLabel(field)}</div>
                      <div className="mt-1">Besitzer: {getOwnerName(field)}</div>
                      <div className="mt-1">Fläche: {formatHa(field.areaHa)} ha</div>
                      <div className="mt-1">
                        Im Revier: {formatHa(field.overlapHa)} ha ·{" "}
                        {field.overlapPercent.toFixed(1)} %
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              ))}
            </div>
          );
        })}

        {fields.map((field) => {
          if (
            typeof field.locationLatitude !== "number" ||
            typeof field.locationLongitude !== "number"
          ) {
            return null;
          }

          return (
            <CircleMarker
              key={`${field.id}-meeting-point`}
              center={[field.locationLatitude, field.locationLongitude]}
              radius={7}
              pathOptions={{
                color: "#111827",
                weight: 2,
                fillColor: "#22c55e",
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold">Treffpunkt</div>
                  <div>{getFieldLabel(field)}</div>
                  {field.locationNote ? (
                    <div className="mt-1 text-gray-700">{field.locationNote}</div>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}