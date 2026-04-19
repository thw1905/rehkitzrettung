import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "PILOT" | "SUCHER";
      isAdmin: boolean;
      firstName: string;
      lastName: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "PILOT" | "SUCHER";
    isAdmin: boolean;
    firstName: string;
    lastName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "PILOT" | "SUCHER";
    isAdmin: boolean;
    firstName: string;
    lastName: string;
  }
}