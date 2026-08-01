import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import NotificationsClient from "./notifications-client";

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const params = await searchParams;
  const filter = params.filter ?? "all";

  const mutedTypes = currentUser.mutedNotificationTypes ?? [];

  const where: Record<string, unknown> = { userId: currentUser.id };
  if (filter === "unread") where.isRead = false;
  if (filter === "read") where.isRead = true;
  if (mutedTypes.length > 0) where.type = { notIn: mutedTypes };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: currentUser.id,
      isRead: false,
      ...(mutedTypes.length > 0 ? { type: { notIn: mutedTypes } } : {}),
    },
  });

  return (
    <NotificationsClient
      notifications={notifications}
      unreadCount={unreadCount}
      currentFilter={filter}
    />
  );
}
