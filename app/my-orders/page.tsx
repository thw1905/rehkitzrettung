import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MyOrdersPageClient from "@/components/orders/my-orders-page-client";

export default async function MyOrdersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <MyOrdersPageClient
      isAdmin={!!(session.user as any).isAdmin}
      role={(session.user as any).role}
    />
  );
}