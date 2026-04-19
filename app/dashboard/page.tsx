import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import DashboardPageClient from "@/components/dashboard/dashboard-page-client";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardPageClient
      isAdmin={!!(session.user as any).isAdmin}
    />
  );
}