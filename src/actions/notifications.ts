"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/** Mark a single notification as read */
export async function markNotificationRead(notificationId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    await prisma.notification.update({
      where: { id: notificationId, userId: currentUser.id },
      data: { isRead: true },
    });

    revalidatePath("/dashboard/notifications");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Mark all notifications as read for current user */
export async function markAllNotificationsRead() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    await prisma.notification.updateMany({
      where: { userId: currentUser.id, isRead: false },
      data: { isRead: true },
    });

    revalidatePath("/dashboard/notifications");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Delete a single notification */
export async function deleteNotification(notificationId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    await prisma.notification.delete({
      where: { id: notificationId, userId: currentUser.id },
    });

    revalidatePath("/dashboard/notifications");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Delete all read notifications for current user */
export async function deleteReadNotifications() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Non authentifié.");

    await prisma.notification.deleteMany({
      where: { userId: currentUser.id, isRead: true },
    });

    revalidatePath("/dashboard/notifications");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
