// Reine Textfunktionen: auch in der Vorschau im Browser verwendbar.
// Keine HTML-Mails; Revier- und Flaechennamen werden als normaler Text eingefuegt.
export const DEFAULT_REV_OWNER_MAIL_SUBJECT = "Rehkitzrettung: Suche am {{datum}}";
export const DEFAULT_REV_OWNER_MAIL_BODY = `Hallo {{paechter}},

für den {{datum}} ist eine Rehkitzsuche in deinem Revier geplant.
{{treffzeit}}

Treffpunkt:
{{treffpunkt}}

Betroffene Reviere:
{{reviere}}

Betroffene Flächen:
{{flaechen}}

Landwirte der betroffenen Flächen:
{{landwirte}}

Diese Nachricht wurde automatisch erstellt, weil für dein Revier ein Einsatz geplant wurde.

Viele Grüße
Rehkitzrettung`;

export const REV_OWNER_MAIL_PLACEHOLDERS = [
  { key: "paechter", label: "Name des Revierpächters" },
  { key: "datum", label: "Einsatzdatum, z. B. 12.05.2027" },
  { key: "uhrzeit", label: "Treffzeit ohne Zusatz, z. B. 06:00 Uhr" },
  { key: "treffzeit", label: "Komplette Treffzeit-Zeile; leer, falls keine festgelegt ist" },
  { key: "treffpunkt", label: "Treffpunkt des Einsatztages mit Standortangabe und ggf. Kartenlink" },
  { key: "reviere", label: "Liste der betroffenen Reviere" },
  { key: "flaechen", label: "Liste der betroffenen Flächen" },
  { key: "landwirte", label: "Landwirte und die zugehörigen Flächen (je Revierpächter)" },
] as const;

export type RevierMailValues = Record<(typeof REV_OWNER_MAIL_PLACEHOLDERS)[number]["key"], string>;

/**
 * Bei aelteren gespeicherten Vorlagen den Treffpunkt in die Mail einfuegen,
 * ohne den in der Datenbank bearbeiteten Text zu veraendern.
 * Der Block erscheint niemals hinter der Grussformel.
 */
export function ensureRevierMailMeetingPoint(body: string): string {
  if (/{{\s*treffpunkt\s*}}/i.test(body)) return body;
  const block = "\n\nTreffpunkt:\n{{treffpunkt}}";
  const time = /{{\s*treffzeit\s*}}/i.exec(body);
  if (time) {
    const at = time.index + time[0].length;
    return body.slice(0, at) + block + body.slice(at);
  }
  const header = /(?:^|\n)\s*Betroffene Reviere\s*:/i.exec(body);
  if (header) return body.slice(0, header.index) + block + "\n" + body.slice(header.index);
  const footer = /(?:^|\n)\s*(?:Viele Grüße|Mit freundlichen Grüßen|Freundliche Grüße|Beste Grüße|Herzliche Grüße|Diese Nachricht wurde automatisch erstellt)/i.exec(body);
  if (footer) return body.slice(0, footer.index) + block + "\n" + body.slice(footer.index);
  return body.trimEnd() + block;
}

export function renderRevierMailText(template: string, data: RevierMailValues): string {
  const result = template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (whole, name: string) => {
    return Object.prototype.hasOwnProperty.call(data, name)
      ? data[name as keyof RevierMailValues]
      : whole;
  });
  // Entfernt nur ueberfluessige Leerzeilen, z. B. wenn keine Treffzeit gesetzt ist.
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function validateRevierMailTemplate(subject: string, body: string): string | null {
  if (!subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)) {
    return "Der Betreff muss einzeilig sein und darf maximal 200 Zeichen enthalten.";
  }
  if (!body.trim() || body.length > 10000) {
    return "Der Nachrichtentext darf nicht leer sein und maximal 10.000 Zeichen enthalten.";
  }
  const permitted = new Set<string>(REV_OWNER_MAIL_PLACEHOLDERS.map((item) => item.key));
  for (const match of [...subject.matchAll(/{{([^{}]*)}}/g), ...body.matchAll(/{{([^{}]*)}}/g)]) {
    const name = match[1].trim();
    if (!permitted.has(name)) return `Unbekannter Platzhalter: {{${name}}}.`;
  }
  // Nicht geschlossene oder verschachtelte Platzhalter ebenfalls erkennen.
  const stripped = (subject + body).replace(/{{[^{}]*}}/g, "");
  if (stripped.includes("{{") || stripped.includes("}}")) {
    return "Mindestens ein Platzhalter ist unvollständig.";
  }
  return null;
}

export const EXAMPLE_REV_OWNER_MAIL_VALUES: RevierMailValues = {
  paechter: "Max Mustermann",
  datum: "12.05.2027",
  uhrzeit: "06:00 Uhr",
  treffzeit: "Treffzeit: 06:00 Uhr.",
  treffpunkt: "Wiesenweg bei Hittfeld\nGPS: 53.384000, 9.977000\nKarte: https://www.google.com/maps/search/?api=1&query=53.384000%2C9.977000",
  reviere: "- 12 · Revier Musterwald\n- 13 · Revier Wiesenbach",
  flaechen: "- Nordwiese · Fläche 17\n- Hofwiese · Fläche 42",
  landwirte: "- Hans Meyer: Nordwiese · Fläche 17\n- Sabine Schulz: Hofwiese · Fläche 42",
};

/**
 * Repariert ausschliesslich die fehlerhafte automatische Ergaenzung aus der
 * vorherigen Version, die den Landwirte-Block HINTER die Grussformel gesetzt hat.
 *
 * Bereits selbst angeordnete Vorlagen bleiben unveraendert. Insbesondere
 * fuegt diese Funktion den Platzhalter nicht erneut hinzu, wenn ein Admin ihn
 * bewusst aus der Vorlage entfernt hat.
 */
export function relocateAppendedLandwirteSection(body: string): string {
  const original = body.trimEnd();
  const appendedBlock = /(?:\r?\n){2,}Landwirte der betroffenen Flächen:[ \t]*\r?\n[ \t]*{{[ \t]*landwirte[ \t]*}}[ \t]*$/i;
  if (!appendedBlock.test(original)) return body;

  const remaining = original.replace(appendedBlock, "").trimEnd();
  const nl = remaining.includes("\r\n") ? "\r\n" : "\n";
  const block = `Landwirte der betroffenen Flächen:${nl}{{landwirte}}`;
  const fields = /{{[ \t]*flaechen[ \t]*}}/i.exec(remaining);

  if (fields) {
    const position = fields.index + fields[0].length;
    const before = remaining.slice(0, position).trimEnd();
    const after = remaining.slice(position).trimStart();
    return `${before}${nl}${nl}${block}${after ? nl + nl + after : ""}`;
  }

  // Auch individuell geaenderte Vorlagen ohne {{flaechen}} sollen die
  // Angaben noch VOR dem Abschlusstext / der Grussformel erhalten.
  const footer = /(?:^|\r?\n)[ \t]*(?:Diese Nachricht wurde automatisch erstellt|Viele Grüße|Mit freundlichen Grüßen|Freundliche Grüße|Beste Grüße|Herzliche Grüße)/i.exec(remaining);
  if (footer) {
    const before = remaining.slice(0, footer.index).trimEnd();
    const after = remaining.slice(footer.index).trimStart();
    return `${before}${nl}${nl}${block}${nl}${nl}${after}`;
  }

  // Ohne erkennbaren Abschluss koennen wir keine bessere Position bestimmen.
  return `${remaining}${nl}${nl}${block}`;
}
