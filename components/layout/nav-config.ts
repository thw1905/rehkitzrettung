// REHKITZ_MOBILE_NAV_V1 - Eine gemeinsame Navigationsstruktur fuer Desktop und Handy.
// Diese Datei regelt NUR die Sichtbarkeit im Menue, nicht die serverseitige Zugriffspruefung.
export type NavLink = { href: string; label: string };
export type NavSection = { title: string; color: string; items: NavLink[] };
export type Navigation = {
  personal: NavSection[];
  management: NavSection[];
  operations: NavSection[];
};

const BLUE = "border-blue-200 bg-blue-50 text-blue-950";
const GREEN = "border-green-200 bg-green-50 text-green-950";
const AMBER = "border-amber-200 bg-amber-50 text-amber-950";
const PURPLE = "border-purple-200 bg-purple-50 text-purple-950";
const SLATE = "border-slate-200 bg-slate-50 text-slate-950";
const SKY = "border-sky-200 bg-sky-50 text-sky-950";



const personalSections: NavSection[] = [
  { title: "Meine Einsätze", color: BLUE, items: [
    { href: "/my-orders", label: "Meine Aufträge" },
    { href: "/my-notifications", label: "Meine Benachrichtigungen" },
    { href: "/team-members", label: "Mein Team" },
    { href: "/historical-pinpoints", label: "Historische PinPoints" },
    { href: "/sicherungsorte", label: "Sicherungsorte" },
  ] },
  { title: "Meine Daten", color: GREEN, items: [
    { href: "/availability", label: "Meine Verfügbarkeit" },
    { href: "/personal-statistics", label: "Meine Statistik" },
    { href: "/profile", label: "Mein Profil" },
  ] },
];
const managementSections: NavSection[] = [
  { title: "Aufträge / Anfragen", color: BLUE, items: [
    { href: "/orders", label: "Aufträge" },
    { href: "/field-order-map", label: "Aufträge per Karte" },
    { href: "/admin/mowing-requests", label: "Mähanfragen" },
  ] },
  { title: "Landwirte und Flächen", color: GREEN, items: [
    { href: "/owners", label: "Landwirte" },
    { href: "/fields", label: "Flächen" },
    { href: "/owner-field-map", label: "Landwirt-Flächenkarte" },
  ] },
  { title: "Helferverwaltung", color: SKY, items: [
    { href: "/helpers", label: "Helfer" },
  ] },
  { title: "Reviere / Hegeringe", color: AMBER, items: [
    { href: "/reviere", label: "Reviere" },
    { href: "/hegeringe", label: "Hegeringe" },
    { href: "/revier-paechter", label: "Revierpächter" },
    { href: "/revier-map", label: "Revier-Flächenübersicht" },
    { href: "/admin/reviere-tools", label: "Revier-Werkzeuge" },
  ] },
  { title: "E-Mail / Nachweise", color: PURPLE, items: [
    { href: "/admin/revier-email-template", label: "E-Mail-Vorlage Revierpächter" },
    { href: "/admin/flight-certificates", label: "Befliegungsnachweise" },
  ] },
  { title: "DJI / Drohnen", color: SKY, items: [
    { href: "/admin/dji-akkus", label: "Drohnen und Akkus" },
    { href: "/admin/dji-akku-historie", label: "Akkuhistorie" },
    { href: "/admin/dji-flugzeiten", label: "GPS-Flugzeiten je Fläche" },
    { href: "/admin/flugmissionen", label: "Flugmissionen planen" },
  ] },
  { title: "System / Werkzeuge", color: SLATE, items: [
    { href: "/admin/help", label: "Anleitung bearbeiten" },
    { href: "/admin/email-test", label: "E-Mail-Test" },
    { href: "/admin/db-check", label: "DB-Check" },
    { href: "/admin/gps-test", label: "GPS-Testmodus (PIN)" },
  ] },
];
const operationsSections: NavSection[] = [
  { title: "Übersicht", color: BLUE, items: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/notifications", label: "Benachrichtigungen" },
  ] },
  { title: "Einsatzplanung", color: GREEN, items: [
    { href: "/team-planning", label: "Teamplanung" },
    { href: "/day-assignments", label: "Auftragszuordnung" },
    { href: "/availability/admin", label: "Verfügbarkeit Admin" },
    { href: "/team-slots", label: "Team-Slots" },
  ] },
  { title: "Auswertung / Import", color: AMBER, items: [
    { href: "/statistics", label: "Statistik" },
    { href: "/admin/field-import", label: "KML-Import" },
  ] },
];
export function getNavSections(options: { canOpenGpsTest?: boolean } = {}): Navigation {
  const canOpenGpsTest = options.canOpenGpsTest === true;
  return { personal: personalSections, management: managementSections.map(section => ({
    ...section, items: section.items.filter(item => item.href !== "/admin/gps-test" || canOpenGpsTest),
  })), operations: operationsSections };
}
