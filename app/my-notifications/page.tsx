import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import MyNotificationsPageClient from "@/components/notifications/my-notifications-page-client";

export default async function MyNotificationsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return <MyNotificationsPageClient />;
}