import "./globals.css";
import Providers from "./providers";
import AppHeader from "@/components/layout/app-header";
import MobileBottomNav from "@/components/layout/mobile-bottom-nav";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PushPermissionBanner from "@/components/push/push-permission-banner";
;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  const user = session?.user
    ? {
        firstName: (session.user as any).firstName ?? null,
        lastName: (session.user as any).lastName ?? null,
        role: (session.user as any).role ?? null,
        isAdmin: (session.user as any).isAdmin ?? false,
        
      }
    : null;

  return (
    <html lang="de">
      <body className="bg-white text-gray-900">
        
        <Providers>
          {session?.user ? <AppHeader user={user} /> : null}

          {session?.user ?<PushPermissionBanner/>: null}
        
          <div className={session?.user ? "pb-28 md:pb-0" : ""}>{children}</div>
          
          {session?.user ? <MobileBottomNav user={user} /> : null}
        </Providers>
      </body>
    </html>
  );
}
