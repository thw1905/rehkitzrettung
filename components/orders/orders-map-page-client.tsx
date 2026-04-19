"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const OrdersMapView = dynamic(() => import("./orders-map-view"), {
  ssr: false,
});

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

type Team = {
  id: string;
  name: string;
};

type Field = {
  id: string;
  name: string;
  areaGeoJson: any;
};

type Order = {
  id: string;
  title: string;
  status: "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
  notes: string | null;
  mowingDate: string | null;
  owner: Owner;
  team: Team | null;
  field: Field;
};

export default function OrdersMapPageClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<
    "ALLE" | "OFFEN" | "IN_ARBEIT" | "ERLEDIGT"
  >("ALLE");

  async function loadOrders() {
    setLoading(true);

    try {
      const res = await fetch("/api/orders");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Aufträge konnten nicht geladen werden.");
      }

      setOrders(data);
    } catch (error) {
      console.error("Fehler beim Laden der Aufträge:", error);
      alert("Aufträge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "ALLE") return orders;
    return orders.filter((order) => order.status === statusFilter);
  }, [orders, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: orders.length,
      offen: orders.filter((o) => o.status === "OFFEN").length,
      inArbeit: orders.filter((o) => o.status === "IN_ARBEIT").length,
      erledigt: orders.filter((o) => o.status === "ERLEDIGT").length,
    };
  }, [orders]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Karte mit allen Aufträgen</h1>
          <p className="mt-2 text-sm text-gray-600">
            Alle Einsatzflächen auf einer Karte mit Status und Detailinfos.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-gray-500">Gesamt</div>
            <div className="text-2xl font-bold">{counts.all}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-gray-500">Offen</div>
            <div className="text-2xl font-bold">{counts.offen}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-gray-500">In Arbeit</div>
            <div className="text-2xl font-bold">{counts.inArbeit}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow">
            <div className="text-sm text-gray-500">Erledigt</div>
            <div className="text-2xl font-bold">{counts.erledigt}</div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium">Status filtern</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "ALLE" | "OFFEN" | "IN_ARBEIT" | "ERLEDIGT"
              )
            }
            className="w-full rounded-xl border px-3 py-2 md:max-w-sm"
          >
            <option value="ALLE">Alle</option>
            <option value="OFFEN">Offen</option>
            <option value="IN_ARBEIT">In Arbeit</option>
            <option value="ERLEDIGT">Erledigt</option>
          </select>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          {loading ? (
            <div className="p-6">Karte wird geladen...</div>
          ) : (
            <OrdersMapView orders={filteredOrders} />
          )}
        </div>
      </div>
    </main>
  );
}