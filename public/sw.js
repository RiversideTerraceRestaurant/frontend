/* Riverside Terrace admin service worker: shows new-booking push notifications. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Riverside Terrace";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || "rtr-booking",
    renotify: true,
    requireInteraction: true,
    icon: "/images/restaurant/logo.webp",
    badge: "/favicon.ico",
    data: { url: data.url || "/admin/booking/list" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin/booking/list", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const admin = windows.find((client) => new URL(client.url).pathname.startsWith("/admin"));
    if (admin) { await admin.focus(); return admin.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
