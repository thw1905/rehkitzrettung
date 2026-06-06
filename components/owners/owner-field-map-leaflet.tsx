"use client";

import { useEffect, useMemo } from "react";
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

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: AreaFeature;
  areaHa: number;
  notes?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
};

type PreparedField = {
  id: string;
  code: string;
  label: string;
  rings: [number, number][][];
};

type Props = {
  fields: FieldItem[];
};

function getFieldCode(field: FieldItem) {
  return (field.displayName || "").trim() || "ohne Nr.";
}

function getFieldLabel(field: FieldItem) {
  const code = getFieldCode(field);
  const name = (field.name || "").trim();

  if (code && name) return `${code} · ${name}`;
  if (code) return code;
  if (name) return name;
  return "Unbekannte Fläche";
}

function formatHa(value: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function ringToPositions(ring: unknown): [number, number][] {
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
      const positions = ringToPositions(feature.geometry.coordinates?.[0]);
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

function buildBounds(fields: FieldItem[], preparedFields: PreparedField[]) {
  const bounds = L.latLngBounds([]);

  for (const field of preparedFields) {
    for (const ring of field.rings) {
      for (const pos of ring) {
        bounds.extend(pos);
      }
    }
  }

  for (const field of fields) {
    if (
      typeof field.locationLatitude === "number" &&
      typeof field.locationLongitude === "number"
    ) {
      bounds.extend([field.locationLatitude, field.locationLongitude]);
    }
  }

  return bounds;
}

function FitMapToFields({
  fields,
  preparedFields,
}: {
  fields: FieldItem[];
  preparedFields: PreparedField[];
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = buildBounds(fields, preparedFields);

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 17,
      });
    }
  }, [map, fields, preparedFields]);

  useEffect(() => {
    function preparePrint() {
      const bounds = buildBounds(fields, preparedFields);

      setTimeout(() => {
        map.invalidateSize();

        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [20, 20],
            maxZoom: 17,
          });
        }
      }, 100);
    }

    window.addEventListener("prepare-owner-field-map-print", preparePrint);

    return () => {
      window.removeEventListener("prepare-owner-field-map-print", preparePrint);
    };
  }, [map, fields, preparedFields]);

  return null;
}

export default function OwnerFieldMapLeaflet({ fields }: Props) {
  const preparedFields = useMemo(
    () =>
      fields
        .map((field) => ({
          id: field.id,
          code: getFieldCode(field),
          label: getFieldLabel(field),
          rings: areaFeatureToRings(field.areaGeoJson),
        }))
        .filter((field) => field.rings.length > 0),
    [fields]
  );

  const defaultCenter: [number, number] =
    preparedFields[0]
      ? getCenterFromRings(preparedFields[0].rings) || [53.36, 9.99]
      : [53.36, 9.99];

  const mapKey = `owner-field-map-${fields.length}-${fields
    .map((field) => field.id)
    .join("-")}`;

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-2xl border border-gray-200 print:h-[155mm] print:rounded-none print:border-gray-400">
      <MapContainer
        key={mapKey}
        className="h-full w-full"
        center={defaultCenter}
        zoom={14}
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

        <FitMapToFields fields={fields} preparedFields={preparedFields} />

        {preparedFields.map((preparedField) => {
          const field = fields.find((item) => item.id === preparedField.id);
          if (!field) return null;

          return (
            <div key={preparedField.id}>
              {preparedField.rings.map((positions, index) => (
                <Polygon
                  key={`${preparedField.id}-ring-${index}`}
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
                      <div className="font-bold">{preparedField.label}</div>
                      <div className="mt-1">
                        Fläche: {formatHa(field.areaHa)} ha
                      </div>
                      {field.locationNote ? (
                        <div className="mt-1">
                          Treffpunkt: {field.locationNote}
                        </div>
                      ) : null}
                      {field.notes ? (
                        <div className="mt-1 text-gray-700">{field.notes}</div>
                      ) : null}
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
                    <div className="mt-1 text-gray-700">
                      {field.locationNote}
                    </div>
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