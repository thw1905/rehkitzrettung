import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import NotificationPageClient from "@/components/notifications/notification-page-client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function NotificationPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <NotificationPageClient notificationId={id} />;
}