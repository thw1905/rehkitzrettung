import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import DbCheckPageClient from "@/components/admin/db-check-page-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DbCheckPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const currentUser = await db.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      isAdmin: true,
    },
  });

  if (!currentUser?.isAdmin) {
    redirect("/dashboard");
  }

  return <DbCheckPageClient />;
}