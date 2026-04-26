importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBGDTEiz_ydaAiO_KFr-fL7vgzmsvq32Ys",
  authDomain: "rehkitzrettung-1dd59.firebaseapp.com",
  projectId: "rehkitzrettung-1dd59",
  messagingSenderId: "214395682188",
  appId: "1:214395682188:web:538ed56672779501c4eaa9",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notificationTitle = payload.notification?.title || "Neue Nachricht";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/favicon.ico",
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const link = event.notification?.data?.link || "/";
  event.waitUntil(clients.openWindow(link));
});