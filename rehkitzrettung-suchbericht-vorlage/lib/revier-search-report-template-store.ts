import { db } from "@/lib/db";
import {
  DEFAULT_REVIER_SEARCH_REPORT_BODY,
  DEFAULT_REVIER_SEARCH_REPORT_SUBJECT,
} from "@/lib/revier-search-report-template";

// Eigenständiger Eintrag im BEREITS vorhandenen Prisma-Modell.
// Die bisherige Mail vor der Suche verwendet unverändert den Schlüssel "default".
export const REVIER_SEARCH_REPORT_TEMPLATE_KEY = "search-report";

export async function getRevierSearchReportTemplate() {
  const saved = await db.revierOwnerEmailTemplate.findUnique({
    where: { key: REVIER_SEARCH_REPORT_TEMPLATE_KEY },
    select: { subject: true, body: true, updatedAt: true },
  });

  return {
    subject: saved?.subject ?? DEFAULT_REVIER_SEARCH_REPORT_SUBJECT,
    body: saved?.body ?? DEFAULT_REVIER_SEARCH_REPORT_BODY,
    updatedAt: saved?.updatedAt?.toISOString() ?? null,
  };
}
