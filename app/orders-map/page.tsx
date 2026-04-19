import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OrdersMapPageClient from "@/components/orders/orders-map-page-client";

export default async function OrdersMapPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!(session.user as any).isAdmin) {
    redirect("/dashboard");
  }

  return <OrdersMapPageClient />;
}