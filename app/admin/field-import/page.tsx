import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FieldImportPageClient from "@/components/fields/field-import-page-client";

export default async function FieldImportPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = !!(session.user as any).isAdmin;

  if (!isAdmin) {
    redirect("/");
  }

  return <FieldImportPageClient />;
}