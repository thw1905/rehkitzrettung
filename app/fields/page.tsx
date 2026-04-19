import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FieldsPageClient from "@/components/fields/fields-page-client";

export default async function FieldsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = !!(session.user as any).isAdmin;

  return <FieldsPageClient isAdmin={isAdmin} />;
}