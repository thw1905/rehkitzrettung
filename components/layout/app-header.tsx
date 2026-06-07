"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import SupportContactButton from "@/components/layout/support-contact-button";
import NotificationBell from "../notifications/notification-bell";

type AppHeaderProps = {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null;
};

function navClass(
  isActive: boolean,
  variant: "default" | "personal" = "default"
) {
  const base = "rounded-xl px-3 py-2 text-sm font-medium transition border";

  if (variant === "personal") {
    return [
      base,
      isActive
        ? "border-blue-700 bg-blue-700 text-white"
        : "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100",
    ].join(" ");
  }

  return [
    base,
    isActive
      ? "border-black bg-black text-white"
      : "border-transparent text-gray-800 hover:bg-gray-100 hover:text-black",
  ].join(" ");
}

export default function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin);

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [creatingDemoOrder, setCreatingDemoOrder] = useState(false);
  const [personalMenuOpen, setPersonalMenuOpen] = useState(false);
  const [managementMenuOpen, setManagementMenuOpen] = useState(false);
  const [operationsMenuOpen, setOperationsMenuOpen] = useState(false);

  const closeAllMenus = () => {
    setPersonalMenuOpen(false);
    setManagementMenuOpen(false);
    setOperationsMenuOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;

      if (!target.closest("[data-header-menu]")) {
        closeAllMenus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function handleCreateDemoOrder() {
    const pin = window.prompt("PIN für Demo-Auftrag eingeben:");

    if (!pin) return;

    try {
      setCreatingDemoOrder(true);

      const response = await fetch("/api/demo-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result?.error || "Demo-Auftrag konnte nicht erstellt werden.");
        return;
      }

      alert("Demo-Auftrag erfolgreich erstellt.");
      window.location.href = "/orders";
    } catch (error) {
      console.error("Demo-Auftrag Fehler:", error);
      alert("Demo-Auftrag konnte nicht erstellt werden.");
    } finally {
      setCreatingDemoOrder(false);
    }
  }

  async function handleDeleteDemoOrders() {
    const confirmed = window.confirm("Alle Demo-Aufträge löschen?");

    if (!confirmed) return;

    try {
      const res = await fetch("/api/cleanup-demo-orders", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Demo-Aufträge konnten nicht gelöscht werden.");
        return;
      }

      alert(`Demo-Aufträge gelöscht: ${data.deleted}`);
      window.location.reload();
    } catch (error) {
      console.error("Demo löschen Fehler:", error);
      alert("Demo-Aufträge konnten nicht gelöscht werden.");
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setPendingCount(null);
      return;
    }

    let isMounted = true;

    async function loadPending() {
      try {
        const res = await fetch("/api/users/pending", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        if (isMounted) {
          setPendingCount(typeof data.count === "number" ? data.count : 0);
        }
      } catch {
        // ignorieren
      }
    }

    loadPending();

    const interval = setInterval(loadPending, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAdmin]);

  useEffect(() => {
    let isMounted = true;

    async function loadOnlineCount() {
      try {
        const res = await fetch("/api/users/online-count", {
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        if (isMounted) {
          setOnlineCount(typeof data.count === "number" ? data.count : 0);
        }
      } catch {
        // ignorieren
      }
    }

    loadOnlineCount();

    const interval = setInterval(loadOnlineCount, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const fullName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Unbekannt";

  const personalNavSections = [
    {
      title: "Meine Einsätze",
      color: "border-blue-200 bg-blue-50 text-blue-950",
      items: [
        { href: "/my-orders", label: "Meine Aufträge" },
        { href: "/my-notifications", label: "Meine Benachrichtigungen" },
        { href: "/team-members", label: "Mein Team" },
      ],
    },
    {
      title: "Meine Daten",
      color: "border-green-200 bg-green-50 text-green-950",
      items: [
        { href: "/availability", label: "Meine Verfügbarkeit" },
        { href: "/personal-statistics", label: "Meine Statistik" },
        { href: "/profile", label: "Mein Profil" },
      ],
    },
    {
      title: "Hilfe",
      color: "border-purple-200 bg-purple-50 text-purple-950",
      items: [{ href: "/hilfe", label: "Hilfe / Bedienungsanleitung" }],
    },
  ];

  const personalNavItems = personalNavSections.flatMap(
    (section) => section.items
  );

  const managementNavSections = [
    {
      title: "Einsatz / Aufträge",
      color: "border-blue-200 bg-blue-50 text-blue-950",
      items: [
        { href: "/orders", label: "Aufträge" },
        { href: "/field-order-map", label: "Aufträge per Karte" },
        { href: "/admin/mowing-requests", label: "Mähanfragen" },
      ],
    },
    {
      title: "Stammdaten",
      color: "border-green-200 bg-green-50 text-green-950",
      items: [
        { href: "/helpers", label: "Helfer" },
        { href: "/owners", label: "Landwirte" },
        { href: "/fields", label: "Flächen" },
      ],
    },
    {
      title: "Reviere / Hegeringe",
      color: "border-amber-200 bg-amber-50 text-amber-950",
      items: [
        { href: "/reviere", label: "Reviere" },
        { href: "/hegeringe", label: "Hegeringe" },
        { href: "/revier-paechter", label: "Revierpächter" },
        { href: "/revier-map", label: "Revier/Flächenübersicht" },
        { href: "/owner-field-map", label: "Landwirt-Flächenkarte" },
        { href: "/admin/reviere-tools", label: "Revier-Werkzeuge" },
      ],
    },
    {
      title: "Hilfe / System",
      color: "border-purple-200 bg-purple-50 text-purple-950",
      items: [
        { href: "/hilfe", label: "Hilfe / Bedienungsanleitung" },
        { href: "/admin/help", label: "Anleitung bearbeiten" },
        { href: "/admin/db-check", label: "DB-Check" },
      ],
    },
  ];

  const managementNavItems = managementNavSections.flatMap(
    (section) => section.items
  );

  const operationsNavSections = [
    {
      title: "Übersicht",
      color: "border-blue-200 bg-blue-50 text-blue-950",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/notifications", label: "Benachrichtigungen" },
      ],
    },
    {
      title: "Einsatz",
      color: "border-green-200 bg-green-50 text-green-950",
      items: [
        { href: "/team-planning", label: "Teamplanung" },
        { href: "/day-assignments", label: "Auftragszuordnung" },
      ],
    },
    {
      title: "Verfügbarkeit / Teams",
      color: "border-amber-200 bg-amber-50 text-amber-950",
      items: [
        { href: "/availability/admin", label: "Verfügbarkeit Admin" },
        { href: "/team-slots", label: "Team-Slots" },
      ],
    },
    {
      title: "Auswertung / Import",
      color: "border-purple-200 bg-purple-50 text-purple-950",
      items: [
        { href: "/statistics", label: "Statistik" },
        { href: "/admin/field-import", label: "KML-Import" },
      ],
    },
  ];

  const operationsNavItems = operationsNavSections.flatMap(
    (section) => section.items
  );

  const helpersActive =
    pathname === "/helpers" || pathname.startsWith("/helpers/");

  function isItemActive(item: { href: string }) {
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <>
      <style jsx global>{`
        @keyframes badgePulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }

        .pending-badge-pulse {
          animation: badgePulse 1.4s infinite;
        }
      `}</style>

      <header className="no-print sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-1">
          <div className="flex items-center justify-between md:hidden">
            <div className="min-w-0">
              <div className="text-base font-bold text-gray-900">
                Rehkitzrettung
              </div>
              <div className="truncate text-xs text-gray-700">
                {fullName} · {user?.role || "-"}
                {isAdmin ? " · Admin" : ""}
              </div>

              {onlineCount !== null && (
                <div className="mt-1 text-xs font-medium text-green-700">
                  🟢 {onlineCount} online
                </div>
              )}
            </div>

            <NotificationBell />
            <SupportContactButton />

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-900 transition hover:bg-gray-100"
            >
              Logout
            </button>
          </div>

          <div className="hidden md:flex md:items-start md:justify-between md:gap-3">
            <div className="min-w-0">
              <div className="text-lg font-bold text-gray-900">
                Rehkitzrettung
              </div>
            </div>

            <div className="flex items-center gap-3">
              {onlineCount !== null && (
                <div className="rounded-full border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                  🟢 {onlineCount} online
                </div>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleCreateDemoOrder}
                  disabled={creatingDemoOrder}
                  className="rounded-xl border border-yellow-300 bg-yellow-100 px-3 py-2 text-sm font-semibold text-yellow-900 transition hover:bg-yellow-200 disabled:opacity-50"
                >
                  {creatingDemoOrder ? "Erstelle..." : "🟡 Demo-Auftrag"}
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteDemoOrders}
                  className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                >
                  Demo löschen
                </button>
              )}

              <NotificationBell />
              <SupportContactButton />

              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {fullName}
                </div>
                <div className="text-xs text-gray-700">
                  {user?.role || "-"}
                  {isAdmin ? " · Admin" : ""}
                </div>
              </div>

              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          </div>

          <nav className="mt-3 hidden flex-wrap gap-2 md:flex">
            <div className="relative" data-header-menu>
              <button
                type="button"
                onClick={() => {
                  setPersonalMenuOpen((prev) => !prev);
                  setManagementMenuOpen(false);
                  setOperationsMenuOpen(false);
                }}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
              >
                Persönlicher Bereich ▼
              </button>

              {personalMenuOpen && (
                <div className="absolute left-0 z-50 mt-2 max-h-[75vh] min-w-[320px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                  {personalNavSections.map((section) => (
                    <div
                      key={section.title}
                      className={`mb-2 rounded-2xl border p-2 ${section.color}`}
                    >
                      <div className="px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
                        {section.title}
                      </div>

                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const isActive = isItemActive(item);

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setPersonalMenuOpen(false)}
                              className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                                isActive
                                  ? "bg-gray-900 text-white shadow-sm"
                                  : "bg-white/80 text-gray-900 hover:bg-white"
                              }`}
                            >
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isAdmin && (
              <>
                <div className="relative" data-header-menu>
                  <button
                    type="button"
                    onClick={() => {
                      setManagementMenuOpen((prev) => !prev);
                      setOperationsMenuOpen(false);
                      setPersonalMenuOpen(false);
                    }}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                  >
                    ⚙ Verwaltung ▼
                  </button>

                  {managementMenuOpen && (
                    <div className="absolute left-0 z-50 mt-2 max-h-[75vh] min-w-[340px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                      {managementNavSections.map((section) => (
                        <div
                          key={section.title}
                          className={`mb-2 rounded-2xl border p-2 ${section.color}`}
                        >
                          <div className="px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
                            {section.title}
                          </div>

                          <div className="space-y-1">
                            {section.items.map((item) => {
                              const isActive = isItemActive(item);

                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setManagementMenuOpen(false)}
                                  className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                                    isActive
                                      ? "bg-gray-900 text-white shadow-sm"
                                      : "bg-white/80 text-gray-900 hover:bg-white"
                                  }`}
                                >
                                  {item.label}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative" data-header-menu>
                  <button
                    type="button"
                    onClick={() => {
                      setOperationsMenuOpen((prev) => !prev);
                      setManagementMenuOpen(false);
                      setPersonalMenuOpen(false);
                    }}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                  >
                    📊 Einsatzleitung ▼
                  </button>

                  {operationsMenuOpen && (
                    <div className="absolute left-0 z-50 mt-2 max-h-[75vh] min-w-[320px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
                      {operationsNavSections.map((section) => (
                        <div
                          key={section.title}
                          className={`mb-2 rounded-2xl border p-2 ${section.color}`}
                        >
                          <div className="px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
                            {section.title}
                          </div>

                          <div className="space-y-1">
                            {section.items.map((item) => {
                              const isActive = isItemActive(item);

                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setOperationsMenuOpen(false)}
                                  className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${
                                    isActive
                                      ? "bg-gray-900 text-white shadow-sm"
                                      : "bg-white/80 text-gray-900 hover:bg-white"
                                  }`}
                                >
                                  {item.label}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {isAdmin && pendingCount !== null && pendingCount > 0 && (
              <Link href="/helpers" className={navClass(helpersActive)}>
                <span className="inline-flex items-center">
                  Freigaben
                  <span className="pending-badge-pulse ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {pendingCount}
                  </span>
                </span>
              </Link>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}