// REHKITZ_MOBILE_NAV_V2 - einfaches Handymenue, PC unveraendert.
// REHKITZ_MOBILE_NAV_V1 - gemeinsame Menueeintraege mit dem Desktop; rollengerecht.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getNavSections, type NavSection } from "@/components/layout/nav-config";

type MobileBottomNavProps = {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null;
};
type MenuKey = "personal" | "management" | "operations";

const buttonClass = (active: boolean) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${active ? "bg-slate-900 text-white shadow-sm" : "text-gray-800 hover:bg-gray-100"}`;

export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [managementGroupOpen, setManagementGroupOpen] = useState<string | null>(null);
  const [canOpenGpsTest, setCanOpenGpsTest] = useState(false);
  const [creatingDemoOrder, setCreatingDemoOrder] = useState(false);
  const [deletingDemoOrders, setDeletingDemoOrders] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isAdmin) { setCanOpenGpsTest(false); return; }
    void fetch("/api/admin/gps-test/access", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (!cancelled) setCanOpenGpsTest(json?.allowed === true); })
      .catch(() => { if (!cancelled) setCanOpenGpsTest(false); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  useEffect(() => { setOpenMenu(null); setManagementGroupOpen(null); }, [pathname]);

  // Solange ein Menue offen ist, soll die Seite darunter nicht mitscrollen.
  useEffect(() => {
    if (!openMenu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [openMenu]);
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest("[data-mobile-nav-root]")) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const sections = getNavSections({ canOpenGpsTest });
  const menuSections: Record<MenuKey, NavSection[]> = {
    personal: sections.personal,
    management: isAdmin ? sections.management : [],
    operations: isAdmin ? sections.operations : [],
  };
  const labels: Record<MenuKey, string> = {
    personal: "Persönlich",
    management: "Verwaltung",
    operations: "Einsatzleitung",
  };
  const menuTitle = openMenu ? labels[openMenu] : "";
  const activeSections = openMenu ? menuSections[openMenu] : [];

  const isPath = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const personalActive = ["/personal", "/my-orders", "/my-notifications", "/team-members", "/availability", "/personal-statistics", "/profile", "/historical-pinpoints", "/sicherungsorte"].some(isPath) && !isPath("/availability/admin");
  const managementActive = sections.management.some(section => section.items.some(item => isPath(item.href))) || isPath("/management");
  const operationsActive = sections.operations.some(section => section.items.some(item => isPath(item.href))) || isPath("/operations");

  async function handleCreateDemoOrder() {
    if (!isAdmin || creatingDemoOrder || deletingDemoOrders) return;
    const pin = window.prompt("PIN für Demo-Auftrag eingeben:");
    if (!pin) return;
    setCreatingDemoOrder(true);
    try {
      const response = await fetch("/api/demo-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { window.alert(result?.error || "Demo-Auftrag konnte nicht erstellt werden."); return; }
      setOpenMenu(null);
      window.alert("Demo-Auftrag erfolgreich erstellt.");
      window.location.href = "/orders";
    } catch (error) {
      console.error("Demo-Auftrag Fehler:", error);
      window.alert("Demo-Auftrag konnte nicht erstellt werden.");
    } finally { setCreatingDemoOrder(false); }
  }

  async function handleDeleteDemoOrders() {
    if (!isAdmin || creatingDemoOrder || deletingDemoOrders) return;
    if (!window.confirm("Wirklich alle Demo-Aufträge löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")) return;
    setDeletingDemoOrders(true);
    try {
      const response = await fetch("/api/cleanup-demo-orders", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { window.alert(result?.error || "Demo-Aufträge konnten nicht gelöscht werden."); return; }
      setOpenMenu(null);
      window.alert(`Demo-Aufträge gelöscht: ${result.deleted ?? 0}`);
      window.location.reload();
    } catch (error) {
      console.error("Demo-Aufträge löschen Fehler:", error);
      window.alert("Demo-Aufträge konnten nicht gelöscht werden.");
    } finally { setDeletingDemoOrders(false); }
  }

  const toggle = (key: MenuKey) => {
    setManagementGroupOpen(null);
    setOpenMenu(current => current === key ? null : key);
  };
  const menuButton = (key: MenuKey, emoji: string, active: boolean, shortLabel: string) => (
    <button
      key={key} type="button" onClick={() => toggle(key)}
      aria-expanded={openMenu === key} aria-controls="mobile-navigation-panel"
      className={buttonClass(active || openMenu === key)}
    >
      <span aria-hidden="true" className="text-lg leading-none">{emoji}</span>
      <span className="truncate max-w-full">{shortLabel} {openMenu === key ? "▾" : ""}</span>
    </button>
  );

  return (
    <nav data-mobile-nav-root aria-label="Handy-Navigation" className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-[85] border-t border-gray-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden print:hidden">
      {openMenu && (
        <>
          {/* Eine einzige, klar abgegrenzte Menueebene statt mehrerer Popups. */}
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setOpenMenu(null)}
            className="fixed inset-0 z-[0] cursor-default bg-slate-900/40"
          />
          <div
            id="mobile-navigation-panel"
            role="dialog"
            aria-modal="true"
            aria-label={menuTitle}
            className="absolute bottom-full left-2 right-2 z-[95] mx-auto mb-2 max-h-[min(76dvh,660px)] max-w-[480px] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-200 pb-3">
              <h2 className="text-base font-bold text-gray-900">{menuTitle}</h2>
              <button type="button" aria-label="Menü schließen" onClick={() => setOpenMenu(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800">
                Schließen ×
              </button>
            </div>

            {openMenu === "management" ? (
              /* Verwaltung: nur Kategorien anzeigen; hoechstens eine davon ist offen. */
              <div className="space-y-2">
                {activeSections.map((section) => {
                  const expanded = managementGroupOpen === section.title;
                  return (
                    <section key={section.title} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setManagementGroupOpen(current => current === section.title ? null : section.title)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-3.5 text-left text-sm font-bold ${expanded ? "bg-slate-100 text-slate-950" : "bg-white text-gray-900"}`}
                      >
                        <span>{section.title}</span>
                        <span aria-hidden="true" className="text-lg leading-none">{expanded ? "−" : "+"}</span>
                      </button>
                      {expanded && (
                        <div className="space-y-1 border-t border-gray-200 bg-slate-50 p-2">
                          {section.items.map(item => (
                            <Link key={item.href} href={item.href} onClick={() => setOpenMenu(null)} aria-current={isPath(item.href) ? "page" : undefined} className={`block rounded-lg px-3 py-3 text-sm font-medium ${isPath(item.href) ? "bg-slate-900 text-white" : "bg-white text-gray-900 hover:bg-blue-50"}`}>
                              {item.label}
                            </Link>
                          ))}
                          {isAdmin && section.title === "System / Werkzeuge" && (
                            <div className="space-y-2 border-t border-gray-200 pt-2">
                              <button type="button" onClick={() => void handleCreateDemoOrder()} disabled={creatingDemoOrder || deletingDemoOrders} className="block w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-left text-sm font-semibold text-amber-950 disabled:opacity-50">
                                {creatingDemoOrder ? "Erstelle Demo-Auftrag ..." : "Demo-Auftrag erstellen (PIN)"}
                              </button>
                              <button type="button" onClick={() => void handleDeleteDemoOrders()} disabled={deletingDemoOrders || creatingDemoOrder} className="block w-full rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-left text-sm font-semibold text-red-900 disabled:opacity-50">
                                {deletingDemoOrders ? "Lösche Demo-Aufträge ..." : "Demo-Aufträge löschen"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              /* Persoenlich und Einsatz: kein zweites Aufklappmenue, direkte Links. */
              <div className="space-y-4">
                {activeSections.map(section => (
                  <section key={section.title}>
                    <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-600">{section.title}</h3>
                    <div className="space-y-1.5">
                      {section.items.map(item => (
                        <Link key={item.href} href={item.href} onClick={() => setOpenMenu(null)} aria-current={isPath(item.href) ? "page" : undefined} className={`block rounded-xl border px-3 py-3 text-sm font-medium ${isPath(item.href) ? "border-slate-900 bg-slate-900 text-white" : "border-gray-200 bg-slate-50 text-gray-900 hover:bg-gray-100"}`}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <div className="relative z-[96] mx-auto flex max-w-3xl items-center gap-1.5">
        {isAdmin ? (
          <>
            {menuButton("personal", "👤", personalActive, "Persönlich")}
            {menuButton("operations", "📋", operationsActive, "Einsatz")}
            {menuButton("management", "⚙️", managementActive, "Verwaltung")}
          </>
        ) : (
          <>
            <Link href="/my-orders" onClick={() => setOpenMenu(null)} className={buttonClass(isPath("/my-orders"))}><span aria-hidden="true" className="text-lg leading-none">📋</span><span>Aufträge</span></Link>
            {menuButton("personal", "👤", personalActive, "Persönlich")}
          </>
        )}
        <Link href="/hilfe" onClick={() => setOpenMenu(null)} className={buttonClass(isPath("/hilfe"))}><span aria-hidden="true" className="text-lg leading-none">❓</span><span>Hilfe</span></Link>
      </div>
    </nav>
  );
}
