import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import RevierePageClient from "@/components/reviere/reviere-page-client";

export default async function RevierePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!(session.user as any).isAdmin) {
    redirect("/dashboard");
  }

  return <RevierePageClient />;
}