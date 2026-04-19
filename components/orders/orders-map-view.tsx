"use client";

import {
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  CircleMarker,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import L from "leaflet";
import Link from "next/link";
import { useMemo } from "react";
import "leaflet/dist/leaflet.css";

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
};

type Team = {
  id: string;
  name: string;
};

type Pinpoint = {
  id: string;
  latitude: number;
  longitude: number;
  status: "OFFEN" | "ERREICHT" | "ERLEDIGT";
};

type Field = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
};

type Order = {
  id: string;
  title: string;
  orderCode?: string | null;
  status: "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
  notes?: string | null;
  mowingDate?: string | null;
  owner: Owner;
  team: Team | null;
  field: Field;
  pinpoints?: Pinpoint[];
};

type PreparedPolygon = {
  order: Order;
  positions: [number, number][];
};

function FitMapToData({
  polygons,
  orders,
}: {
  polygons: PreparedPolygon[];
  orders: Order[];
}) {
  const map = useMap();

  useMemo(() => {
    const bounds = L.latLngBounds([]);

    for (const polygon of polygons) {
      for (const pos of polygon.positions) {
        bounds.extend(pos);
      }
    }

    for (const order of orders) {
      for (const p of order.pinpoints || []) {
        if (
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude)
        ) {
          bounds.extend([p.latitude, p.longitude]);
        }
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds as LatLngBoundsExpression, {
        padding: [30, 30],
      });
    }
  }, [map, polygons, orders]);

  return null;
}

export default function OrdersMapView({ orders }: { orders: Order[] }) {
  const polygons = useMemo(() => {
    return orders
      .map((order) => {
        try {
          const geometry = order.field?.areaGeoJson?.geometry;

          if (!geometry || geometry.type !== "Polygon") {
            return null;
          }

          const ring = geometry.coordinates?.[0];

          if (!Array.isArray(ring) || ring.length < 3) {
            return null;
          }

          const positions: [number, number][] = ring
            .map((coord) => {
              if (!Array.isArray(coord) || coord.length < 2) {
                return null;
              }

              const [lng, lat] = coord;

              if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
              }

              return [lat, lng] as [number, number];
            })
            .filter(Boolean) as [number, number][];

          if (positions.length < 3) {
            return null;
          }

          return { order, positions };
        } catch (error) {
          console.error("Fehler bei Fläche:", order.id, error);
          return null;
        }
      })
      .filter(Boolean) as PreparedPolygon[];
  }, [orders]);

  function getOrderColor(status: Order["status"]) {
    if (status === "OFFEN") return "#dc2626";
    if (status === "IN_ARBEIT") return "#eab308";
    return "#16a34a";
  }

  function getPinColor(status: Pinpoint["status"]) {
    if (status === "ERLEDIGT") return "#16a34a";
    if (status === "ERREICHT") return "#eab308";
    return "#dc2626";
  }

  function getStatusLabel(status: Order["status"]) {
    if (status === "OFFEN") return "Offen";
    if (status === "IN_ARBEIT") return "In Arbeit";
    return "Erledigt";
  }

  function getFieldLabel(field: Field) {
    const displayName = (field.displayName || "").trim();
    const name = (field.name || "").trim();

    if (displayName && name) return `${displayName} (${name})`;
    if (displayName) return displayName;
    if (name) return name;
    return "Unbekannte Fläche";
  }

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-2xl">
      <MapContainer
        className="h-full w-full"
        center={[53.36, 9.99]}
        zoom={13}
        scrollWheelZoom={true}
      >
        {/* Satellitenbild */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles © Esri"
          maxZoom={20}
        />

        {/* Straßennamen / Orte über dem Satellitenbild */}
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

        <FitMapToData polygons={polygons} orders={orders} />

        {polygons.map(({ order, positions }) => (
          <Polygon
            key={order.id}
            positions={positions}
            pathOptions={{
              color: getOrderColor(order.status),
              weight: 3,
              fillColor: getOrderColor(order.status),
              fillOpacity: 0.3,
            }}
          >
            <Popup>
              <div className="min-w-[240px] space-y-2">
                <div className="text-base font-semibold">
                  {order.orderCode || order.title}
                </div>

                <div className="space-y-1 text-sm text-gray-700">
                  <div>
                    <b>Status:</b> {getStatusLabel(order.status)}
                  </div>
                  <div>
                    <b>Fläche:</b> {getFieldLabel(order.field)}
                  </div>
                  <div>
                    <b>Ansprechpartner:</b> {order.owner.firstName}{" "}
                    {order.owner.lastName}
                  </div>
                  <div>
                    <b>Team:</b>{" "}
                    {order.team ? order.team.name : "nicht zugeordnet"}
                  </div>
                  {order.mowingDate && (
                    <div>
                      <b>Mähdatum:</b>{" "}
                      {new Date(order.mowingDate).toLocaleDateString("de-DE")}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Link
                    href={`/orders?open=${order.id}`}
                    className="block rounded-xl bg-black px-3 py-2 text-center text-sm text-white"
                  >
                    Auftrag öffnen
                  </Link>
                </div>
              </div>
            </Popup>
          </Polygon>
        ))}

        {orders.flatMap((order) =>
          (order.pinpoints || []).map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.latitude, p.longitude]}
              radius={8}
              pathOptions={{
                color: getPinColor(p.status),
                fillColor: getPinColor(p.status),
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">
                    {order.orderCode || order.title}
                  </div>
                  <div>Status: {p.status}</div>
                  <div>
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                  </div>

                  <Link
                    href={`/orders?open=${order.id}`}
                    className="mt-2 block rounded-lg bg-blue-600 px-3 py-1 text-center text-white"
                  >
                    Öffnen
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))
        )}
      </MapContainer>
    </div>
  );
}
