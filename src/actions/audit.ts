"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function getAuditLogs(organizationId?: string) {
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

  const logs = await prisma.auditLog.findMany({
    where: { user: userWhere },
    include: {
      user: {
        select: { firstName: true, lastName: true, email: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return { success: true, data: logs };
}
