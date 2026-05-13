import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RevierPaechterPageClient from "@/components/reviere/revier-paechter-page-client";

export default async function RevierPaechterPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!(session.user as any).isAdmin) {
    redirect("/dashboard");
  }

  return <RevierPaechterPageClient />;
}