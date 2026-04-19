import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OrdersPageClient from "@/components/orders/orders-page-client";

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = !!(session.user as any).isAdmin;

  return <OrdersPageClient isAdmin={isAdmin} />;
}