import { json, request } from "@/lib/api";

export interface PushConfig { enabled: boolean; publicKey: string; subscriptionCount: number }

export const pushApi = {
  config: () => request<PushConfig>("/admin/push/config"),
  subscribe: (subscription: PushSubscriptionJSON) => request<{ ok: boolean }>("/admin/push/subscriptions", json("POST", subscription)),
  unsubscribe: (endpoint: string) => request<{ ok: boolean }>("/admin/push/subscriptions", json("DELETE", { endpoint })),
  test: () => request<{ registered: number; accepted: number }>("/admin/push/test", json("POST", {})),
};

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
/** iPhone/iPad only deliver web push to a site added to the Home Screen. */
export const needsHomeScreen = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

const registration = () => navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  return existing ? existing.pushManager.getSubscription() : null;
}

/** Asks permission, subscribes this browser and registers it with the server. */
export async function enablePush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in the browser's site settings.");
  const ready = await registration();
  const subscription = (await ready.pushManager.getSubscription()) ?? (await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await pushApi.subscribe(subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
