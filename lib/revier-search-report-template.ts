/**
 * Bearbeitbare E-Mail-Vorlage für den SUCHBERICHT nach Abschluss eines Reviers.
 * Keine Datenbank- oder Server-Abhängigkeiten: auch im Client für die Vorschau nutzbar.
 */
export const DEFAULT_REVIER_SEARCH_REPORT_SUBJECT =
  "Rehkitzrettung – Suchergebnis vom {{datum}} – {{revier}}";

export const DEFAULT_REVIER_SEARCH_REPORT_BODY = [
  "Hallo {{vorname}},",
  "",
  "die Rehkitzsuche in deinem Revier {{revier}} ist abgeschlossen.",
  "Hier erhältst du die Ergebnisse vom {{datum}}.",
  "",
  "Abgesuchte Flächen:",
  "{{flaechen}}",
  "",
  "Wildzahlen in deinem Revier:",
  "{{wildzahlen}}",
  "",
  "Fundstellen:",
  "{{fundstellen}}",
  "",
  "Vielen Dank für deine Unterstützung bei der Rehkitzrettung!",
  "",
  "Viele Grüße",
  "Dein Team der Rehkitzrettung Hegering Hittfeld",
].join("\n");

export const REVIER_SEARCH_REPORT_PLACEHOLDERS = [
  { key: "vorname", label: "Vorname des Revierpächters" },
  { key: "datum", label: "Datum der Suche" },
  { key: "revier", label: "Reviernummer und Reviername" },
  { key: "flaechen", label: "Abgesuchte Flächen einschließlich ihrer Ergebnisse" },
  { key: "wildzahlen", label: "Gesamtergebnis des Reviers, ohne Doppelzählung" },
  { key: "fundstellen", label: "Fundstellen mit GPS-Kartenlinks, soweit vorhanden" },
] as const;

export type RevierSearchReportValues = Record<
  (typeof REVIER_SEARCH_REPORT_PLACEHOLDERS)[number]["key"],
  string
>;

export const EXAMPLE_REVIER_SEARCH_REPORT_VALUES: RevierSearchReportValues = {
  vorname: "Max",
  datum: "18.05.2027",
  revier: "12 · Beispielrevier",
  flaechen: [
    "Wiese am Wald: 2 Rehkitze gesichert, 1 Rehkitz abgesprungen.",
    "Mühlenwiese: keine Wildtiere gefunden.",
  ].join("\n"),
  wildzahlen: [
    "Rehkitze gesichert: 2",
    "Rehkitze abgesprungen: 1",
    "Sonstiges Wild gesichert: 0",
    "Sonstiges Wild abgesprungen: 0",
  ].join("\n"),
  fundstellen: [
    "Wiese am Wald, PinPoint 1: 1 Rehkitz gesichert – GPS-Link (Beispieldaten)",
    "Wiese am Wald, PinPoint 2: 1 Rehkitz gesichert – GPS-Link (Beispieldaten)",
  ].join("\n"),
};

const allowedKeys = new Set<string>(REVIER_SEARCH_REPORT_PLACEHOLDERS.map((p) => p.key));

export function renderRevierSearchReportText(
  text: string,
  values: RevierSearchReportValues
): string {
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => {
    return allowedKeys.has(key) ? values[key as keyof RevierSearchReportValues] : match;
  });
}

export function validateRevierSearchReportTemplate(subject: string, body: string): string | null {
  if (!subject.trim()) return "Bitte einen Betreff eingeben.";
  if (!body.trim()) return "Bitte einen Nachrichtentext eingeben.";
  if (subject.length > 200) return "Der Betreff darf höchstens 200 Zeichen haben.";
  if (body.length > 10000) return "Der Nachrichtentext darf höchstens 10.000 Zeichen haben.";
  if (/[\r\n]/.test(subject)) return "Der Betreff darf keine Zeilenumbrüche enthalten.";

  for (const value of [subject, body]) {
    const found = [...value.matchAll(/{{\s*([^{}]*?)\s*}}/g)];
    for (const match of found) {
      const key = match[1].trim();
      if (!allowedKeys.has(key)) return `Unbekannter Platzhalter: {{${key}}}.`;
    }
    const withoutTokens = value.replace(/{{\s*[^{}]*?\s*}}/g, "");
    if (withoutTokens.includes("{{") || withoutTokens.includes("}}")) {
      return "Ein Platzhalter ist nicht richtig geschlossen.";
    }
  }

  // Diese Inhalte sind Pflicht, damit der Pächter wirklich erfährt, was wo gefunden wurde.
  for (const key of ["flaechen", "wildzahlen", "fundstellen"] as const) {
    if (!new RegExp(`{{\\s*${key}\\s*}}`).test(body)) {
      return `Der Nachrichtentext muss den Platzhalter {{${key}}} enthalten.`;
    }
  }
  return null;
}