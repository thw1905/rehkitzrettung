import { getToken } from "firebase/messaging";
import { getFirebaseMessaging } from "@/lib/firebase";

type RegisterPushResult =
  | { success: true; token: string }
  | { success: false; error: string };

function detectBrowser() {
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes("edg")) return "edge";
  if (ua.includes("chrome")) return "chrome";
  if (ua.includes("safari") && !ua.includes("chrome")) return "safari";
  if (ua.includes("firefox")) return "firefox";

  return "unknown";
}

function detectPlatform() {
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  if (/android/.test(ua)) return "web-android";
  if (/iphone|ipad|ipod/.test(ua)) return "web-ios";
  if (/windows/.test(ua)) return "desktop-windows";
  if (/macintosh|mac os x/.test(ua)) return "desktop-mac";
  if (/linux/.test(ua)) return "desktop-linux";

  return "unknown";
}

export async function registerPush(): Promise<RegisterPushResult> {
  try {
    if (typeof window === "undefined") {
      return { success: false, error: "Kein Browser-Kontext" };
    }

    if (!("Notification" in window)) {
      return { success: false, error: "Benachrichtigungen werden nicht unterstützt" };
    }

    if (!("serviceWorker" in navigator)) {
      return { success: false, error: "Service Worker werden nicht unterstützt" };
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      return { success: false, error: "Benachrichtigungen nicht erlaubt" };
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      return { success: false, error: "Firebase Messaging wird auf diesem Gerät nicht unterstützt" };
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      return { success: false, error: "VAPID Key fehlt" };
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { success: false, error: "Kein Push-Token erhalten" };
    }

    const response = await fetch("/api/push/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        platform: detectPlatform(),
        browser: detectBrowser(),
        deviceLabel: navigator.platform || "Unbekanntes Gerät",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || "Registrierung fehlgeschlagen",
      };
    }

    return { success: true, token };
  } catch (error) {
    console.error("registerPush error:", error);
    return { success: false, error: "Push konnte nicht aktiviert werden" };
  }
}