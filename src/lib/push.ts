import webpush from "web-push";
import { prisma } from "./db";

let configured = false;
let warnedMissingKeys = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    if (!warnedMissingKeys) {
      console.warn("[push] Clés VAPID absentes — les notifications push sont désactivées.");
      warnedMissingKeys = true;
    }
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

// Best-effort : appelée après une écriture Notification déjà actée en base — un échec d'envoi
// push ne doit jamais remonter à l'appelant ni annuler quoi que ce soit. Respecte
// mutedNotificationTypes (même préférence que la cloche en base, cf. User.mutedNotificationTypes)
// avant d'envoyer, pour ne jamais pousser un type que l'utilisateur a explicitement masqué.
export async function sendPushToUsers(
  entries: { userId: string; title: string; message: string; type: string }[]
) {
  try {
    if (!ensureConfigured() || entries.length === 0) return;

    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, mutedNotificationTypes: true },
    });
    const mutedByUser = new Map(users.map((u) => [u.id, new Set(u.mutedNotificationTypes)]));
    const eligible = entries.filter((e) => !mutedByUser.get(e.userId)?.has(e.type));
    if (eligible.length === 0) return;

    const eligibleUserIds = [...new Set(eligible.map((e) => e.userId))];
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: eligibleUserIds } },
    });
    const subsByUser = new Map<string, typeof subscriptions>();
    for (const sub of subscriptions) {
      const list = subsByUser.get(sub.userId) || [];
      list.push(sub);
      subsByUser.set(sub.userId, list);
    }

    for (const entry of eligible) {
      const subs = subsByUser.get(entry.userId) || [];
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: entry.title, body: entry.message })
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error("[push] Échec d'envoi:", err?.message || err);
          }
        }
      }
    }
  } catch (error) {
    console.error("[push] sendPushToUsers a échoué:", error);
  }
}
