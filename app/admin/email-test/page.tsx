import { notFound } from "next/navigation";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import EmailTestClient from "@/components/admin/email-test-client";

export const dynamic = "force-dynamic";

export default async function EmailTestPage() {
  const user = await getCurrentUserWithTeams();
  if (!user?.isAdmin) notFound();
  return <EmailTestClient />;
}
