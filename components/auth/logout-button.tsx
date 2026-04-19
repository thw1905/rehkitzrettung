"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  async function handleLogout() {
    try {
      await signOut({
        redirect: true,
        callbackUrl: "/login",
      });
    } catch (error) {
      console.error("Logout-Fehler:", error);
      alert("Abmelden hat nicht funktioniert.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-xl bg-red-500 px-4 py-2 text-white"
    >
      Abmelden
    </button>
  );
}