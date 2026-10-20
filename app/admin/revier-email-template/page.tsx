import { notFound } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import RevierEmailTemplateClient from "@/components/admin/revier-email-template-client";

export const dynamic = "force-dynamic";

export default async function RevierEmailTemplatePage() {
  const user = await getCurrentUserWithTeams();
  if (!user?.isAdmin) notFound();
  return <RevierEmailTemplateClient />;
}
