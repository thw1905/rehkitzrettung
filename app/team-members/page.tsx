import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TeamMembersPageClient from "@/components/team/team-members-page-client";

export default async function TeamMembersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return <TeamMembersPageClient />;
}