import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ProfilePageClient from "@/components/profile/profile-page-client";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <ProfilePageClient
      user={{
        firstName: (session.user as any).firstName || "",
        lastName: (session.user as any).lastName || "",
        email: session.user.email || "",
        role: (session.user as any).role || "",
        isAdmin: Boolean((session.user as any).isAdmin),
      }}
    />
  );
}