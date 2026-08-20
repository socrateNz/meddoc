import { prisma } from "@/lib/db";
import Sidebar from "./sidebar";

// Isole les requêtes secondaires (notifications non lues, cliniques d'une holding, alertes
// super-admin) dans son propre composant serveur asynchrone, rendu via <Suspense> dans le
// layout. Avant cette extraction, ces trois requêtes étaient await-ées directement dans
// DashboardLayout : leur résolution bloquait le rendu de {children} sur CHAQUE page du
// dashboard, en plus de la sidebar elle-même — même une page déjà rapide (grâce aux index
// ajoutés plus tôt) attendait ces requêtes annexes avant d'afficher le moindre pixel.
export default async function SidebarData({ currentUser }: { currentUser: any }) {
  let unreadCounts = {
    total: 0,
    incident: 0,
    appointment: 0,
    message: 0,
    ai: 0,
    lab: 0,
  };

  if (currentUser) {
    const mutedTypes = currentUser.mutedNotificationTypes ?? [];
    const unreadNotifications = await prisma.notification.findMany({
      where: {
        userId: currentUser.id,
        isRead: false,
        ...(mutedTypes.length > 0 ? { type: { notIn: mutedTypes } } : {}),
      },
      select: {
        type: true,
      },
    });

    unreadCounts = {
      total: unreadNotifications.length,
      incident: unreadNotifications.filter((n) => n.type === "INCIDENT").length,
      appointment: unreadNotifications.filter((n) => n.type === "APPOINTMENT").length,
      message: unreadNotifications.filter((n) => n.type === "MESSAGE").length,
      ai: unreadNotifications.filter((n) => n.type === "AI").length,
      lab: unreadNotifications.filter((n) => n.type === "LAB_CRITICAL").length,
    };
  }

  let clinics: { id: string; name: string }[] = [];
  if (currentUser && currentUser.organization?.type === "HOLDING") {
    clinics = await prisma.organization.findMany({
      where: {
        parentId: currentUser.organizationId,
        type: "CLINIC",
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  let superAdminAlerts: { contactMessages: number; expiringLicenses: number } | undefined;
  if (currentUser && currentUser.role === "SUPER_ADMIN") {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [contactMessages, expiringLicenses] = await Promise.all([
      prisma.contactMessage.count({ where: { status: "NEW" } }),
      prisma.organization.count({
        // MongoDB trie `null` avant toute date : sans `not: null` explicite,
        // `lte` remonte aussi les holdings à licence illimitée.
        where: { type: "HOLDING", licenseExpiresAt: { not: null, lte: in30Days } },
      }),
    ]);
    superAdminAlerts = { contactMessages, expiringLicenses };
  }

  return <Sidebar currentUser={currentUser} unreadCounts={unreadCounts} clinics={clinics} superAdminAlerts={superAdminAlerts} />;
}
