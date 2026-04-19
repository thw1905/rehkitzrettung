import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireUserPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return session;
}

export async function requireAdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!(session.user as any).isAdmin) {
    redirect("/dashboard");
  }

  return session;
}

export async function requireAdminApi() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      ok: false,
      status: 401,
      message: "Nicht angemeldet",
    };
  }

  if (!(session.user as any).isAdmin) {
    return {
      ok: false,
      status: 403,
      message: "Keine Berechtigung",
    };
  }

  return {
    ok: true,
    session,
  };
}