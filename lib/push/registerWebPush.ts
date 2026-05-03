export async function registerWebPush() {
  try {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker nicht unterstützt");
    }

    if (!("PushManager" in window)) {
      throw new Error("Push nicht unterstützt");
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Keine Berechtigung");
    }

    const registration = await navigator.serviceWorker.register("/sw.js");

    const existing = await registration.pushManager.getSubscription();

    if (existing) {
  await fetch("/api/web-push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(existing),
  });

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
      return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch("/api/web-push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscription),
    });

    return { success: true };
  } catch (error: any) {
    console.error("WebPush Fehler:", error);
    return { success: false, error: error.message };
  }
}