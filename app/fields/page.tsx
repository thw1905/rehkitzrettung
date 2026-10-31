import Link from "next/link";
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

  // REHKITZ_FLUGMISSION_V1 – Admin-Link zur neuen Flugmissionsplanung.
  return <>
    {isAdmin && <div className="mx-auto max-w-6xl px-4 pt-4"><Link href="/admin/flugmissionen" className="inline-flex rounded-xl border border-blue-400 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-950 hover:bg-blue-100">✈ DJI Flugmission für FL-Fläche planen</Link></div>}
    <FieldsPageClient isAdmin={isAdmin} />
  </>;
}