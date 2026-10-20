import { db } from "@/lib/db";
import {
  DEFAULT_REV_OWNER_MAIL_SUBJECT,
  DEFAULT_REV_OWNER_MAIL_BODY,
  relocateAppendedLandwirteSection,
} from "@/lib/revier-owner-mail-template";

export async function getRevierOwnerMailTemplate() {
  let saved = await db.revierOwnerEmailTemplate.findUnique({
    where: { key: "default" },
  });

  // Repariert die bereits gespeicherten Vorlagen, bei denen der Landwirte-
  // Abschnitt hinter der Grußformel angehaengt worden ist.
  // CAS: Eine gleichzeitig bearbeitete Vorlage wird niemals ueberschrieben.
  // Fehlende Platzhalter werden NICHT ungefragt erneut angefuegt.
  if (saved) {
    const correctedBody = relocateAppendedLandwirteSection(saved.body);
    if (correctedBody !== saved.body) {
      await db.revierOwnerEmailTemplate.updateMany({
        where: { key: "default", body: saved.body },
        data: { body: correctedBody },
      });
      saved = await db.revierOwnerEmailTemplate.findUnique({
        where: { key: "default" },
      });
    }
  }

  return {
    subject: saved?.subject ?? DEFAULT_REV_OWNER_MAIL_SUBJECT,
    body: saved?.body ?? DEFAULT_REV_OWNER_MAIL_BODY,
    updatedAt: saved?.updatedAt?.toISOString() ?? null,
  };
}
