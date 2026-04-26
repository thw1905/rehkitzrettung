import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  useSecureCookies: false,

  session: {
    strategy: "jwt",
  },

  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    },
  },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();
        const password = credentials.password;

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        if (!user.isApproved) {
          throw new Error("NOT_APPROVED");
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
          return null;
        }

        const updatedUser = await db.user.update({
          where: { id: user.id },
          data: {
            sessionVersion: {
              increment: 1,
            },
            lastSeenAt: new Date(),
          },
        });

        return {
          id: updatedUser.id,
          email: updatedUser.email,
          name: `${updatedUser.firstName} ${updatedUser.lastName}`,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role,
          isAdmin: updatedUser.isAdmin,
          isApproved: updatedUser.isApproved,
          sessionVersion: updatedUser.sessionVersion,
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.isAdmin = (user as any).isAdmin;
        token.isApproved = (user as any).isApproved;
        token.firstName = (user as any).firstName;
        token.lastName = (user as any).lastName;
        token.sessionVersion = (user as any).sessionVersion;
        return token;
      }

      if (token?.id) {
        const dbUser = await db.user.findUnique({
          where: { id: String(token.id) },
          select: {
            sessionVersion: true,
            isApproved: true,
          },
        });

        if (!dbUser || !dbUser.isApproved) {
          token.invalidSession = true;
          return token;
        }

        if (dbUser.sessionVersion !== token.sessionVersion) {
          token.invalidSession = true;
          return token;
        }
      }

      return token;
    },

    async session({ session, token }) {
  if ((token as any).invalidSession) {
    session.expires = new Date(0).toISOString();
    return session;
  }

  if (session.user) {
    (session.user as any).id = token.id;
    (session.user as any).role = token.role;
    (session.user as any).isAdmin = token.isAdmin;
    (session.user as any).isApproved = token.isApproved;
    (session.user as any).firstName = token.firstName;
    (session.user as any).lastName = token.lastName;
    (session.user as any).sessionVersion = token.sessionVersion;
  }

  return session;
}
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};