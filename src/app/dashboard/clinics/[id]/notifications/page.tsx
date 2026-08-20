import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import NotificationsClient from "@/app/dashboard/notifications/notifications-client";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export default async function ClinicNotificationsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const clinicId = resolvedParams.id;
  const filter = resolvedSearchParams.filter ?? "all";

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const where: Record<string, unknown> = { userId: currentUser.id };
  if (filter === "unread") where.isRead = false;
  if (filter === "read") where.isRead = true;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: currentUser.id, isRead: false },
  });

  return (
    <NotificationsClient
      notifications={notifications}
      unreadCount={unreadCount}
      currentFilter={filter}
      clinicId={clinicId}
    />
  );
}
