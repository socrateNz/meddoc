import { prisma } from "@/lib/db";

export async function logAuditAction(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: any
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
