"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import SupportContactButton from "./support-contact-button";
import { icon } from "leaflet";

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

function moreItemClass(active: boolean) {
  return [
    "block rounded-xl px-3 py-3 text-sm font-medium transition",
    active
      ? "bg-black text-white"
      : "text-gray-800 hover:bg-gray-100 active:bg-gray-200",
  ].join(" ");
}

export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin);
  const [moreOpen, setMoreOpen] = useState(false);

  const baseItems = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/my-orders", label: "Meine Aufträge", icon: "📋" },
    { href: "/team-members", label: "Mein Team", icon: "🧑‍🤝‍🧑"},
    { href: "/availability", label: "Meine Verfügbarkeit", icon: "📅" },
    
  ];

  const adminMoreItems = [
    { href: "/orders", label: "Alle Aufträge" },
    { href: "/team-planning", label: "Teamplanung" },
    { href: "/day-assignments", label: "Auftragszuordnung" },
    { href: "/team-slots", label: "Team-Slots" },
    { href: "/availability/admin", label: "Verfügbarkeit Admin" },
    { href: "/owners", label: "Ansprechpartner" },
    { href: "/helpers", label: "Helfer" },
    { href: "/orders-map", label: "Kartenübersicht" },
    { href: "/statistics", label: "Statistik" },
    { href: "/fields", label: "Flächen" },
    { href: "/profile", label: "Mein Profil" },
  ];

  const userMoreItems = [{ href: "/profile", label: "Mein Profil" },
    { href: "/fields", label: "Flächen" },
  ];

  const moreItems = isAdmin ? adminMoreItems : userMoreItems;

  const isMoreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/30 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <div className="fixed inset-x-3 bottom-24 z-[90] rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl md:hidden">
          <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Mehr
          </div>

          <div className="space-y-1">
            {moreItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={moreItemClass(active)}
                >
                  {item.label}
                </Link>
              );
            })}

            <SupportContactButton/>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="block w-full rounded-xl px-3 py-3 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 active:bg-red-100"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[85] border-t border-gray-200 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {baseItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={navButtonClass(active)}
                onClick={() => setMoreOpen(false)}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="mt-1 truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            className={navButtonClass(isMoreActive || moreOpen)}
          >
            <span className="text-base leading-none">☰</span>
            <span className="mt-1 truncate">Mehr</span>
          </button>
        </div>
      </nav>
    </>
  );
}