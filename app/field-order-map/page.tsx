import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import FieldOrderMapClient from "@/components/orders/field-order-map-client";

export default async function FieldOrderMapPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!(session.user as any).isAdmin) {
    redirect("/dashboard");
  }

  return <FieldOrderMapClient />;
}