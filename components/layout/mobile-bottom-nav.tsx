"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  const baseItems = isAdmin
    ? [
        { href: "/personal", label: "Persönlich", icon: "👤" },
        { href: "/management", label: "Verwaltung", icon: "⚙️" },
        { href: "/operations", label: "Einsatz", icon: "📊" },
      ]
    : [
        { href: "/personal", label: "Persönlich", icon: "👤" },
        { href: "/dashboard", label: "Dashboard", icon: "🏠" },
        { href: "/fields", label: "Flächen", icon: "🌾" },
      ];

  function isItemActive(item: { href: string }) {
    if (item.href === "/personal") {
      return (
        pathname.startsWith("/personal") ||
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
        pathname.startsWith("/owners")
      );
    }

    if (item.href === "/operations") {
      return (
        pathname.startsWith("/operations") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/team-planning") ||
        pathname.startsWith("/day-assignments") ||
        pathname.startsWith("/notifications") ||
        pathname.startsWith("/availability/admin") ||
        pathname.startsWith("/team-slots") ||
        pathname.startsWith("/statistics") ||
        pathname.startsWith("/admin/field-import")
      );
    }

    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[85] border-t border-gray-200 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
    
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {baseItems.map((item) => {
          const active = isItemActive(item);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={navButtonClass(active)}
>
  <span className="text-base leading-none">
    {item.icon}
  </span>
  <span className="mt-1 truncate">
    {item.label}
  </span>
</Link>

);
})}
</div>
</nav>
);
}