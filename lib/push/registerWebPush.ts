export async function registerWebPush() {
  try {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker nicht unterstützt");
    }

    if (!("PushManager" in window)) {
      throw new Error("Push nicht unterstützt");
    }

    if (!("Notification" in window)) {
      throw new Error("Benachrichtigungen nicht unterstützt");
    }

    console.log("Notification.permission vorher:", Notification.permission);

    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    console.log("Notification.permission nachher:", permission);

    if (permission !== "granted") {
      throw new Error(`Keine Berechtigung: Browser meldet ${permission}`);
    }

    const registration = await navigator.serviceWorker.register("/sw.js");

    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      const res = await fetch("/api/web-push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(existing),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || "Push-Abo konnte nicht gespeichert werden."
        );
      }

      return { success: true };
    }

    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

    if (!publicKey) {
      throw new Error("Public Key fehlt");
    }

    function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey),
});

const res = await fetch("/api/web-push/subscribe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(subscription),
});

const data = await res.json().catch(() => null);

if (!res.ok) {
  throw new Error(data?.error || "Push-Abo konnte nicht gespeichert werden.");
}

return { success: true };
} catch (error: any) {
console.error("WebPush Fehler:", error);

return {
  success: false,
  error: error?.message || "Push konnte nicht aktiviert werden.",
};
}
}