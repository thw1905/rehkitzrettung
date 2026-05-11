import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PersonalStatisticsPageClient from "@/components/statistics/personal-statistics-page-client";

export default async function PersonalStatisticsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return <PersonalStatisticsPageClient />;
}