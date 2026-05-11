"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const PersonalStatisticsMap = dynamic(
  () => import("@/components/statistics/personal-statistics-map"),
  { ssr: false }
);

type StatsSummary = {
  totalOrders: number;
  totalDays: number;
  totalAreaSqm: number;
  totalAreaHa: number;
  totalMinutes: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};

type MyOrder = {
  id: string;
  orderCode?: string | null;
  title: string;
  executionDate?: string | null;
  mowingDate?: string | null;
  fieldName: string;
  ownerName: string;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
  areaSqm: number;
  durationMinutes: number;
};

type MyField = {
  orderId: string;
  orderCode?: string | null;
  title: string;
  executionDate?: string | null;
  mowingDate?: string | null;
  field: {
    id: string;
    name: string;
    displayName?: string | null;
    areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
    locationLatitude?: number | null;
    locationLongitude?: number | null;
  };
  owner: {
    firstName: string;
    lastName: string;
  };
};

type StatisticsData = {
  user: {
    firstName: string;
    lastName: string;
    role: string;
    isAdmin: boolean;
  };
  mine: StatsSummary;
  total: StatsSummary;
  myOrders: MyOrder[];
  myFields: MyField[];
};

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}
function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function StatCard({
  label,
  mine,
  total,
  suffix = "",
}: {
  label: string;
  mine: string | number;
  total: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500">Ich</div>
          <div className="text-xl font-bold text-gray-900">
            {mine}
            {suffix}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500">Gesamt</div>
          <div className="text-xl font-bold text-gray-700">
            {total}
            {suffix}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PersonalStatisticsPageClient() {
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStatistics() {
    try {
      const res = await fetch("/api/personal-statistics", {
        cache: "no-store",
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.error || "Statistik konnte nicht geladen werden.");
      }

      setData(result);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Statistik konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatistics();
  }, []);
if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          Statistik wird geladen...
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const mine = data.mine;
  const total = data.total;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Persönliche Statistik
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Auswertung deiner erledigten Einsätze im Vergleich zur Gesamtstatistik.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Einsatztage"
            mine={mine.totalDays}
            total={total.totalDays}
          />

          <StatCard
            label="Einsätze"
            mine={mine.totalOrders}
            total={total.totalOrders}
          />

          <StatCard
            label="Fläche"
            mine={formatNumber(mine.totalAreaHa, 1)}
            total={formatNumber(total.totalAreaHa, 1)}
            suffix=" ha"
          />

          <StatCard
            label="Einsatzzeit"
            mine={formatMinutes(mine.totalMinutes)}
            total={formatMinutes(total.totalMinutes)}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Rehkitze gesichert"
            mine={mine.rehkitzeGesichert}
            total={total.rehkitzeGesichert}
          />

          <StatCard
            label="Rehkitze abgesprungen"
            mine={mine.rehkitzeAbgesprungen}
            total={total.rehkitzeAbgesprungen}
          />
<StatCard
            label="Sonstiges Wild gesichert"
            mine={mine.sonstigesWildGesichert}
            total={total.sonstigesWildGesichert}
          />

          <StatCard
            label="Sonstiges Wild abgesprungen"
            mine={mine.sonstigesWildAbgesprungen}
            total={total.sonstigesWildAbgesprungen}
          />

          <StatCard
            label="Maulwurf/Fehlstellen"
            mine={mine.maulwurfhuegelFehlstelle}
            total={total.maulwurfhuegelFehlstelle}
          />
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Meine bearbeiteten Flächen
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Karte aller Flächen, bei denen du in einem erledigten Einsatz beteiligt warst.
            </p>
          </div>

          {data.myFields.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Noch keine erledigten Flächen vorhanden.
            </div>
          ) : (
            <div className="h-[55vh] overflow-hidden rounded-2xl">
              <PersonalStatisticsMap items={data.myFields} />
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
          <h2 className="text-lg font-bold text-gray-900">
            Meine erledigten Einsätze
          </h2>

          {data.myOrders.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Noch keine erledigten Einsätze vorhanden.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Datum</th>
                      <th className="px-4 py-3">Auftrag</th>
                      <th className="px-4 py-3">Fläche</th>
                      <th className="px-4 py-3">ha</th>
                      <th className="px-4 py-3">Zeit</th>
                      <th className="px-4 py-3">Kitze</th>
                      <th className="px-4 py-3">Wild</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200 bg-white">
                    {data.myOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3">
                          {formatDate(order.executionDate || order.mowingDate)}
                        </td>

                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {order.orderCode || order.title}
                        </td>

                        <td className="px-4 py-3">
                          {order.fieldName}
                        </td>

                        <td className="px-4 py-3">
                          {formatNumber(order.areaSqm / 10000, 1)}
                        </td>

                        <td className="px-4 py-3">
                          {formatMinutes(order.durationMinutes)}
                        </td>

                        <td className="px-4 py-3">
                          {order.rehkitzeGesichert} gesichert /{" "}
                          {order.rehkitzeAbgesprungen} abgesprungen
                        </td>

                        <td className="px-4 py-3">
                          {order.sonstigesWildGesichert} gesichert /{" "}
                          {order.sonstigesWildAbgesprungen} abgesprungen
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
                