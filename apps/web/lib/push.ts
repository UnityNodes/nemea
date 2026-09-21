import { api } from "./api.ts";

export type PushSupport = { supported: true } | { supported: false; reason: string };

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "Push is only available in a browser." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "This browser does not support push notifications." };
  }
  return { supported: true };
}

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function enablePush(publicKey: string): Promise<void> {
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser settings and try again.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error("The browser returned an incomplete push subscription.");
  await api<{ ok: true }>("/channels/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: { p256dh, auth } } });
}

export async function disablePush(): Promise<void> {
  const support = pushSupport();
  let endpoint: string | undefined;
  if (support.supported) {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      endpoint = subscription.endpoint;
      await subscription.unsubscribe();
    }
  }
  await api<{ ok: true }>("/channels/push", { method: "DELETE", body: endpoint ? { endpoint } : {} });
}
