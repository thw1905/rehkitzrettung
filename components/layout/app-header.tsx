"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type AppHeaderProps = {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null;
};

function navClass(isActive: boolean) {
  return [
    "rounded-xl px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-black text-white"
      : "text-gray-800 hover:bg-gray-100 hover:text-black",
  ].join(" ");
}

export default function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

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

  const fullName =
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Unbekannt";

  const desktopNavItems = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/my-orders", label: "Meine Aufträge", show: true },
    { href: "/availability", label: "Verfügbarkeit", show: true },
    { href: "/fields", label: "Flächen", show: true },
    { href: "/profile", label: "Mein Profil", show: true },

    { href: "/orders", label: "Aufträge", show: isAdmin },
    { href: "/orders-map", label: "Karte", show: isAdmin },
    { href: "/owners", label: "Ansprechpartner", show: isAdmin },
    { href: "/team-slots", label: "Team-Slots", show: isAdmin },
    { href: "/team-planning", label: "Teamplanung", show: isAdmin },
    { href: "/day-assignments", label: "Auftragszuordnung", show: isAdmin },
    { href: "/helpers", label: "Helfer", show: isAdmin },
    { href: "/statistics", label: "Statistik", show: isAdmin },
    { href: "/availability/admin", label: "Verfügbarkeit Admin", show: isAdmin },
  ].filter((item) => item.show);

  const helpersActive =
    pathname === "/helpers" || pathname.startsWith("/helpers/");

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

      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between md:hidden">
            <div className="min-w-0">
              <div className="text-base font-bold text-gray-900">
                Rehkitzrettung
              </div>
              <div className="truncate text-xs text-gray-700">
                {fullName} · {user?.role || "-"}
                {isAdmin ? " · Admin" : ""}
              </div>
            </div>

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
            {desktopNavItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navClass(isActive)}
                >
                  {item.label}
                </Link>
              );
            })}

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