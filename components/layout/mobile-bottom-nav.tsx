"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type MobileBottomNavProps = {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null;
};

function navButtonClass(active: boolean) {
  return [
    "flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-semibold transition",
    active
      ? "bg-black text-white shadow-sm"
      : "bg-transparent text-gray-800 hover:bg-gray-100 active:bg-gray-200",
  ].join(" ");
}

export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin);
  // Jeder Admin darf den Link sehen. Die eigentliche GPS-Testseite und
  // die API bleiben serverseitig durch Admin-Rechte und DEMO_ORDER_PIN
  // geschuetzt. Eine fehlgeschlagene Verfuegbarkeitsabfrage darf den
  // Menuepunkt auf dem Smartphone nicht unsichtbar machen.
  const canOpenGpsTest = isAdmin;
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [creatingDemoOrder, setCreatingDemoOrder] = useState(false);
  const [deletingDemoOrders, setDeletingDemoOrders] = useState(false);

  // Dieselben API-Aufrufe wie in der Desktop-Navigation verwenden.
  async function handleCreateDemoOrder() {
    if (!isAdmin || creatingDemoOrder || deletingDemoOrders) return;

    const pin = window.prompt("PIN für Demo-Auftrag eingeben:");
    if (!pin) return;

    setCreatingDemoOrder(true);
    try {
      const response = await fetch("/api/demo-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(result?.error || "Demo-Auftrag konnte nicht erstellt werden.");
        return;
      }
      setHelpMenuOpen(false);
      window.alert("Demo-Auftrag erfolgreich erstellt.");
      window.location.href = "/orders";
    } catch (error) {
      console.error("Demo-Auftrag Fehler:", error);
      window.alert("Demo-Auftrag konnte nicht erstellt werden.");
    } finally {
      setCreatingDemoOrder(false);
    }
  }

  async function handleDeleteDemoOrders() {
    if (!isAdmin || creatingDemoOrder || deletingDemoOrders) return;

    const confirmed = window.confirm(
      "Wirklich alle Demo-Aufträge löschen? Dieser Vorgang kann nicht rückgängig gemacht werden."
    );
    if (!confirmed) return;

    setDeletingDemoOrders(true);
    try {
      const response = await fetch("/api/cleanup-demo-orders", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(result?.error || "Demo-Aufträge konnten nicht gelöscht werden.");
        return;
      }
      setHelpMenuOpen(false);
      window.alert(`Demo-Aufträge gelöscht: ${result.deleted ?? 0}`);
      window.location.reload();
    } catch (error) {
      console.error("Demo löschen Fehler:", error);
      window.alert("Demo-Aufträge konnten nicht gelöscht werden.");
    } finally {
      setDeletingDemoOrders(false);
    }
  }

  useEffect(() => { setHelpMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!helpMenuOpen) return;
    function closeOnOutside(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest("[data-mobile-help-menu]")) {
        setHelpMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setHelpMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [helpMenuOpen]);

  const baseItems = isAdmin
    ? [
        { href: "/personal", label: "Persönlich", icon: "👤" },
        { href: "/management", label: "Verwaltung", icon: "⚙️" },
        { href: "/operations", label: "Einsatz", icon: "📊" },
        { href: "/hilfe", label: "Hilfe", icon: "❓" },
      ]
    : [
        { href: "/personal", label: "Persönlich", icon: "👤" },
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/hilfe", label: "Hilfe", icon: "❓" },
      ];

  function isItemActive(item: { href: string }) {
    if (item.href === "/personal") {
      return (
        pathname.startsWith("/personal") ||
        pathname.startsWith("/personal-statistics") ||
        pathname.startsWith("/my-orders") ||
        pathname.startsWith("/my-notifications") ||
        pathname.startsWith("/team-members") ||
        (pathname.startsWith("/availability") &&
          !pathname.startsWith("/availability/admin")) ||
        pathname.startsWith("/profile")
      );
    }

    if (item.href === "/management") {
      return (
        pathname.startsWith("/management") ||
        pathname.startsWith("/orders") ||
        pathname.startsWith("/field-order-map") ||
        pathname.startsWith("/helpers") ||
        pathname.startsWith("/fields") ||
        pathname.startsWith("/owners") ||
        pathname.startsWith("/owner-field-map") ||
        pathname.startsWith("/admin/mowing-requests") ||
        pathname.startsWith("/reviere") ||
        pathname.startsWith("/hegeringe") ||
        pathname.startsWith("/revier-paechter") ||
        pathname.startsWith("/revier-map") ||
        pathname.startsWith("/admin/reviere-tools") ||
        pathname.startsWith("/admin/help") ||
        pathname.startsWith("/admin/db-check")
      );
    }

    if (item.href === "/operations") {
      return (
        pathname.startsWith("/operations") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/day-assignments") ||
        pathname.startsWith("/team-planning") ||
        pathname.startsWith("/notifications") ||
        pathname.startsWith("/availability/admin") ||
        pathname.startsWith("/team-slots") ||
        pathname.startsWith("/statistics") ||
        pathname.startsWith("/admin/field-import")
      );
    }

    if (item.href === "/hilfe") {
      return pathname === "/hilfe" || pathname.startsWith("/hilfe/") ||
        (canOpenGpsTest && pathname.startsWith("/admin/gps-test"));
    }

    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <nav className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-[85] border-t border-gray-200 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden print:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {baseItems.map((item) => {
          const active = isItemActive(item);

          // Fuer Administratoren oeffnet "Hilfe" auf Mobilgeraeten
          // den Bereich "Hilfe / System". Andere Nutzer verwenden
          // weiterhin den bisherigen direkten Hilfe-Link.
          if (item.href === "/hilfe" && canOpenGpsTest) {
            return (
              <div key={item.href} data-mobile-help-menu className="relative flex min-w-0 flex-1">
                {helpMenuOpen && (
                  <div id="gps-test-mobile-help-menu"
                    className="absolute bottom-[calc(100%+12px)] right-0 z-[95] max-h-[min(75dvh,520px)] w-[min(320px,90vw)] space-y-1 overflow-y-auto rounded-2xl border border-purple-200 bg-white p-3 shadow-2xl">
                    <div className="px-2 pb-1 text-xs font-extrabold uppercase tracking-wide text-purple-900">
                      Hilfe / System
                    </div>
                    <Link
                      href="/hilfe"
                      onClick={() => setHelpMenuOpen(false)}
                      className="block rounded-xl bg-purple-50 px-3 py-3 text-sm font-semibold text-gray-900 hover:bg-purple-100"
                    >
                      ❓ Hilfe / Bedienungsanleitung
                    </Link>
                    <Link
                      href="/admin/gps-test"
                      onClick={() => setHelpMenuOpen(false)}
                      className="block rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                    >
                      🔒 GPS-Testmodus (PIN)
                    </Link>
                    <div className="mt-2 border-t border-purple-100 pt-2">
                      <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                        Demo-Aufträge
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCreateDemoOrder()}
                        disabled={creatingDemoOrder || deletingDemoOrders}
                        className="mb-2 block w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {creatingDemoOrder ? "Erstelle Demo-Auftrag ..." : "🟡 Demo-Auftrag erstellen (PIN)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDemoOrders()}
                        disabled={creatingDemoOrder || deletingDemoOrders}
                        className="block w-full rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-left text-sm font-semibold text-red-900 hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {deletingDemoOrders ? "Lösche Demo-Aufträge ..." : "🗑️ Demo-Aufträge löschen"}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setHelpMenuOpen((open) => !open)}
                  aria-expanded={helpMenuOpen}
                  aria-controls="gps-test-mobile-help-menu"
                  className={navButtonClass(active || helpMenuOpen) + " w-full"}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="mt-1 truncate">{item.label} {helpMenuOpen ? "▾" : "▴"}</span>
                </button>
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={navButtonClass(active)}>
              <span className="text-base leading-none">{item.icon}</span>
              <span className="mt-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
