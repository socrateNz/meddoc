// Helpers navigateur Web Push, partagés entre l'initialisation automatique
// (push-notifications-init.tsx) et le toggle manuel de Réglages (settings-client.tsx).
"use client";

import { subscribeToPush, unsubscribeFromPush } from "@/actions/push";

export type PushStatus = "unsupported" | "granted" | "denied" | "default";

function isSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function getPushStatus(): PushStatus {
  if (!isSupported()) return "unsupported";
  return Notification.permission as PushStatus;
}

// Conversion standard requise par pushManager.subscribe({ applicationServerKey }).
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Idempotent : ré-appeler sur un abonnement déjà actif ne crée rien de nouveau côté navigateur,
// et l'upsert serveur (par endpoint) réassigne simplement l'abonnement à l'utilisateur courant —
// couvre aussi le cas d'un autre utilisateur qui se connecte sur ce même appareil.
export async function subscribeAndPersist(): Promise<boolean> {
  if (!isSupported()) return false;
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const res = await subscribeToPush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return res.success;
  } catch (error) {
    console.error("[push] Échec de l'abonnement:", error);
    return false;
  }
}

export async function unsubscribeAndForget(): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    const res = await unsubscribeFromPush(endpoint);
    return res.success;
  } catch (error) {
    console.error("[push] Échec du désabonnement:", error);
    return false;
  }
}
