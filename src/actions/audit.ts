"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolvePage } from "@/lib/pagination";

export async function getAuditLogs(organizationId?: string, options?: { page?: number; pageSize?: number }) {
  const activeUser = await getCurrentUser();
  if (!activeUser || activeUser.role !== "ADMIN") {
    throw new Error("Non autorisé. Réservé aux administrateurs.");
  }

  const userWhere: any = {};
  if (organizationId) {
    userWhere.organizationId = organizationId;
  } else if (activeUser.organization?.type === "HOLDING") {
    userWhere.OR = [
      { organizationId: activeUser.organizationId },
      { organization: { parentId: activeUser.organizationId } },
    ];
  } else if (activeUser.organization?.type === "CLINIC") {
    userWhere.organizationId = activeUser.organizationId;
  }

  const { page, pageSize, skip, take } = resolvePage(options);
  const where = { user: userWhere };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { success: true, data: logs, total, page, pageSize };
}
