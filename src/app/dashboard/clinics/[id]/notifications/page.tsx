import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import NotificationsClient from "@/app/dashboard/notifications/notifications-client";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { resolvePage } from "@/lib/pagination";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}

export default async function ClinicNotificationsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const clinicId = resolvedParams.id;
  const filter = resolvedSearchParams.filter ?? "all";
  const { page, pageSize, skip, take } = resolvePage({ page: resolvedSearchParams.page });

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const where: Record<string, unknown> = { userId: currentUser.id };
  if (filter === "unread") where.isRead = false;
  if (filter === "read") where.isRead = true;

  // Les 2 requêtes ci-dessous sont indépendantes, on les lance en parallèle.
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
      where: { userId: currentUser.id, isRead: false },
    }),
  ]);

  return (
    <div className="space-y-4">
      <NotificationsClient
        notifications={notifications}
        unreadCount={unreadCount}
        currentFilter={filter}
        clinicId={clinicId}
      />
      <PaginationNav
        page={page}
        pageSize={pageSize}
        total={total}
        pathname={`/dashboard/clinics/${clinicId}/notifications`}
        query={{ filter: filter === "all" ? undefined : filter }}
        itemLabel="notification"
      />
    </div>
  );
}
