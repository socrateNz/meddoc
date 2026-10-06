import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import NotificationsClient from "./notifications-client";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { resolvePage } from "@/lib/pagination";

interface PageProps {
  searchParams: Promise<{ filter?: string; page?: string }>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const params = await searchParams;
  const filter = params.filter ?? "all";
  const { page, pageSize, skip, take } = resolvePage({ page: params.page });

  const mutedTypes = currentUser.mutedNotificationTypes ?? [];

  const where: Record<string, unknown> = { userId: currentUser.id };
  if (filter === "unread") where.isRead = false;
  if (filter === "read") where.isRead = true;
  if (mutedTypes.length > 0) where.type = { notIn: mutedTypes };

  const [notifications, total, unreadCount] = await Promise.all([
    // Une page à la fois (20 max) ; le total suit le filtre actif.
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        userId: currentUser.id,
        isRead: false,
        ...(mutedTypes.length > 0 ? { type: { notIn: mutedTypes } } : {}),
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <NotificationsClient
        notifications={notifications}
        unreadCount={unreadCount}
        currentFilter={filter}
      />
      <PaginationNav
        page={page}
        pageSize={pageSize}
        total={total}
        pathname="/dashboard/notifications"
        query={{ filter: filter === "all" ? undefined : filter }}
        itemLabel="notification"
      />
    </div>
  );
}
