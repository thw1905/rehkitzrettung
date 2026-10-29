// REHKITZ_WILD_DIALOG_MENUE_V2 – Handy: Wild-Sicherungsorte fuer alle angemeldeten Rollen.
// DJI_ADMIN_UI_V11_5: DJI-Verbindung nur aus Navigation ausgeblendet.
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
  const [managementMenuOpen, setManagementMenuOpen] = useState(false);
  const [systemSectionOpen, setSystemSectionOpen] = useState(true);
  const [creatingDemoOrder, setCreatingDemoOrder] = useState(false);
  const [deletingDemoOrders, setDeletingDemoOrders] = useState(false);

  // Dieselben Endpunkte wie in der Desktop-Navigation. Die Rechtepruefung
  // erfolgt zusaetzlich serverseitig. Der Demoauftrag benoetigt die Demo-PIN.
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
      setManagementMenuOpen(false);
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
      const response = await fetch("/api/cleanup-demo-orders", {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(result?.error || "Demo-Aufträge konnten nicht gelöscht werden.");
        return;
      }
      setManagementMenuOpen(false);
      window.alert(`Demo-Aufträge gelöscht: ${result.deleted ?? 0}`);
      window.location.reload();
    } catch (error) {
      console.error("Demo löschen Fehler:", error);
      window.alert("Demo-Aufträge konnten nicht gelöscht werden.");
    } finally {
      setDeletingDemoOrders(false);
    }
  }

  useEffect(() => {
    setManagementMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!managementMenuOpen) return;

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-mobile-management-menu]")) {
        setManagementMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setManagementMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [managementMenuOpen]);

  const baseItems = isAdmin
    ? [
        { href: "/personal", label: "Persönlich", icon: "👤" },
        { href: "/management", label: "Verwaltung", icon: "⚙️" },
        { href: "/operations", label: "Einsatz", icon: "📊" },
        { href: "/sicherungsorte", label: "Sicherungsorte", icon: "\uD83D\uDCCD" },
        { href: "/hilfe", label: "Hilfe", icon: "❓" },
      ]
    : [
        { href: "/personal", label: "Persönlich", icon: "👤" },
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/sicherungsorte", label: "Sicherungsorte", icon: "\uD83D\uDCCD" },
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
        pathname.startsWith("/admin/db-check") ||
        pathname.startsWith("/admin/gps-test") ||
        pathname.startsWith("/admin/email-test") ||
        pathname.startsWith("/admin/revier-email-template") ||
        pathname.startsWith("/admin/flight-certificates")
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

    // 'Hilfe' fuehrt auf dem Handy fuer alle direkt zur Bedienungsanleitung.
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <nav className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-[85] border-t border-gray-200 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden print:hidden">
      {isAdmin && managementMenuOpen && (
        <div
          data-mobile-management-menu
          id="mobile-management-system-menu"
          className="absolute bottom-full left-3 right-3 z-[95] mx-auto mb-2 max-h-[min(77dvh,620px)] max-w-[420px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl"
        >
          <div className="mb-2 px-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
            Verwaltung
          </div>
          <Link
            href="/management"
            onClick={() => setManagementMenuOpen(false)}
            className="mb-2 block rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100"
          >
            ⚙️ Verwaltungsübersicht öffnen
          </Link>

          <section className="mb-2 rounded-xl border border-purple-200 bg-purple-50 p-2">
            <div className="px-2 py-2 text-sm font-extrabold text-purple-950">Hilfe</div>
            <div className="space-y-2">
              <Link
                href="/hilfe"
                onClick={() => setManagementMenuOpen(false)}
                className="block rounded-xl border border-purple-200 bg-white px-3 py-3 text-sm font-semibold text-purple-950 hover:bg-purple-100"
              >
                ❓ Bedienungsanleitung
              </Link>
              <Link
                href="/admin/help"
                onClick={() => setManagementMenuOpen(false)}
                className="block rounded-xl border border-purple-200 bg-white px-3 py-3 text-sm font-semibold text-purple-950 hover:bg-purple-100"
              >
                Anleitung bearbeiten
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <button
              type="button"
              onClick={() => setSystemSectionOpen((open) => !open)}
              aria-expanded={systemSectionOpen}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-extrabold text-slate-950"
            >
              <span>System / Werkzeuge</span>
              <span aria-hidden="true">{systemSectionOpen ? "−" : "+"}</span>
            </button>
            {systemSectionOpen && (
              <div className="space-y-2 pt-1">
                                {/* DJI_MENU_V11_4: DJI-Links im bestehenden mobilen Verwaltungsmenue. */}
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-2">
                  <div className="mb-2 px-2 text-xs font-extrabold uppercase text-sky-950">DJI / Drohnen</div>
                  <div className="space-y-2">
                    <Link href="/admin/dji-akkus" onClick={() => setManagementMenuOpen(false)} className="block rounded-xl border border-sky-200 bg-white px-3 py-3 text-sm font-semibold text-sky-950 hover:bg-sky-100">Drohnen und Akkus</Link>
                    <Link href="/admin/dji-akku-historie" onClick={() => setManagementMenuOpen(false)} className="block rounded-xl border border-sky-200 bg-white px-3 py-3 text-sm font-semibold text-sky-950 hover:bg-sky-100">Akkuhistorie</Link>
                    <Link href="/admin/dji-flugzeiten" onClick={() => setManagementMenuOpen(false)} className="block rounded-xl border border-sky-200 bg-white px-3 py-3 text-sm font-semibold text-sky-950 hover:bg-sky-100">GPS-Flugzeiten je Fläche</Link>
                    <Link
                  href="/admin/gps-test"
                  onClick={() => setManagementMenuOpen(false)}
                  className="block rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                >
                  🔒 GPS-Testmodus (PIN)
                </Link>
                  </div>
                </div>
                <Link
                  href="/admin/email-test"
                  onClick={() => setManagementMenuOpen(false)}
                  className="block rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-100"
                >
                  ✉️ E-Mail-Test
                </Link>
                <Link
                  href="/admin/revier-email-template"
                  onClick={() => setManagementMenuOpen(false)}
                  className="block rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-100"
                >
                  ✉️ E-Mail-Vorlage Revierpächter
                </Link>
                <Link
                  href="/admin/flight-certificates"
                  onClick={() => setManagementMenuOpen(false)}
                  className="block rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-100"
                >
                  📄 Befliegungsnachweise
                </Link>
                <button
                  type="button"
                  onClick={() => void handleCreateDemoOrder()}
                  disabled={creatingDemoOrder || deletingDemoOrders}
                  className="block w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
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
                <Link
                  href="/admin/db-check"
                  onClick={() => setManagementMenuOpen(false)}
                  className="block rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  DB-Check
                </Link>
              </div>
            )}
          </section>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {baseItems.map((item) => {
          const active = isItemActive(item);

          if (isAdmin && item.href === "/management") {
            return (
              <button
                key={item.href}
                data-mobile-management-menu
                type="button"
                onClick={() => setManagementMenuOpen((open) => !open)}
                aria-expanded={managementMenuOpen}
                aria-controls="mobile-management-system-menu"
                className={navButtonClass(active || managementMenuOpen)}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="mt-1 truncate">{item.label} {managementMenuOpen ? "▾" : "▴"}</span>
              </button>
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
