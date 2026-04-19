import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OwnersPageClient from "@/components/owners/owners-page-client";

export default async function OwnersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!(session.user as any).isAdmin) {
    redirect("/dashboard");
  }

  return <OwnersPageClient />;
}