import { prisma } from "./db";

// Anciennement déclenché par un setInterval démarré au chargement de
// src/lib/db.ts — retiré car incompatible avec un déploiement serverless
// (chaque instance/invocation est éphémère, un setInterval n'y survit pas).
// Cette fonction est maintenant appelée par la route protégée
// src/app/api/cron/scheduler/route.ts, elle-même déclenchée par un service
// de cron externe (voir .env.example : CRON_SECRET).
export async function runSchedulerTasks() {
  const now = new Date();

  // 1. DAILY AGENDA NOTIFICATIONS
  await sendDailyAgenda(now);

  // 2. APPOINTMENT REMINDERS
  await sendAppointmentReminders(now);

  // 3. EXPIRING STOCK LOTS (rien ne "se déclenche" quand un lot vieillit — uniquement planifié)
  await checkExpiringStock(now);

  // 4. LOW STOCK SAFETY NET (couvre les articles déjà sous le seuil au déploiement, ou un
  // événement stock.low qui aurait échoué silencieusement côté finance.ts/lab.ts/stock.ts)
  await checkLowStock(now);
}

async function sendDailyAgenda(now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  try {
    // Find all caregivers with appointments today
    const appointmentsToday = await prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          gte: startOfToday,
          lte: endOfToday
        },
        caregiverId: { not: null }
      },
      include: {
        caregiver: { include: { user: true } },
        patient: { include: { user: true } }
      }
    });

    // Group appointments by caregiver ID
    const caregiverAppointments: Record<string, typeof appointmentsToday> = {};
    for (const app of appointmentsToday) {
      if (app.caregiverId) {
        if (!caregiverAppointments[app.caregiverId]) {
          caregiverAppointments[app.caregiverId] = [];
        }
        caregiverAppointments[app.caregiverId].push(app);
      }
    }

    for (const caregiverId of Object.keys(caregiverAppointments)) {
      const appointments = caregiverAppointments[caregiverId];
      const caregiver = appointments[0].caregiver;
      if (!caregiver || !caregiver.user) continue;

      const todayString = startOfToday.toISOString().split("T")[0];
      
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: caregiver.userId,
          title: `📅 Votre agenda du jour (${todayString})`,
        }
      });

      if (!existingNotification) {
        // Compile agenda message
        const listText = appointments
          .map(app => {
            const timeStr = app.scheduledAt.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
            const patientName = `${app.patient.user.lastName} ${app.patient.user.firstName}`;
            return `- ${timeStr} : ${app.title} (Patient : ${patientName})`;
          })
          .join("\n");

        await prisma.notification.create({
          data: {
            userId: caregiver.userId,
            title: `📅 Votre agenda du jour (${todayString})`,
            message: `Bonjour ${caregiver.user.firstName}, vous avez ${appointments.length} intervention(s) aujourd'hui :\n${listText}`,
            type: "APPOINTMENT",
          }
        });
        
        console.log(`[Scheduler] Daily agenda sent to caregiver ${caregiver.user.lastName} (${caregiver.userId})`);
      }
    }
  } catch (error) {
    console.error("Error sending daily agenda:", error);
  }
}

async function sendAppointmentReminders(now: Date) {
  try {
    // Look for appointments scheduled within the next 25 hours
    const maxTime = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const appointments = await prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          gte: now,
          lte: maxTime
        },
        caregiverId: { not: null }
      },
      include: {
        caregiver: { include: { user: true } },
        patient: { include: { user: true } }
      }
    });

    for (const app of appointments) {
      if (!app.caregiver || !app.caregiver.user) continue;

      const diffMs = app.scheduledAt.getTime() - now.getTime();
      const diffHours = diffMs / (60 * 60 * 1000);

      // Define reminder configurations
      const reminders = [
        { key: "24h", label: "24 heures", minHour: 23.5, maxHour: 24.5 },
        { key: "2h", label: "2 heures", minHour: 1.8, maxHour: 2.2 },
        { key: "1h", label: "1 heure", minHour: 0.8, maxHour: 1.2 },
      ];

      for (const rem of reminders) {
        if (diffHours >= rem.minHour && diffHours <= rem.maxHour) {
          const reminderTitle = `⏰ Rappel ${rem.label} : ${app.title}`;
          
          // Check if notification already exists to prevent duplicate reminders
          const existing = await prisma.notification.findFirst({
            where: {
              userId: app.caregiver.userId,
              title: reminderTitle
            }
          });

          if (!existing) {
            const timeStr = app.scheduledAt.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
            const patientName = `${app.patient.user.lastName} ${app.patient.user.firstName}`;
            
            await prisma.notification.create({
              data: {
                userId: app.caregiver.userId,
                title: reminderTitle,
                message: `Rappel : Votre intervention "${app.title}" pour le patient ${patientName} est planifiée dans ${rem.label} (à ${timeStr}).`,
                type: "APPOINTMENT"
              }
            });

            console.log(`[Scheduler] Reminder (${rem.key}) sent to caregiver for appointment ${app.id}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error sending appointment reminders:", error);
  }
}

async function checkExpiringStock(now: Date) {
  try {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringLots = await prisma.stockPurchase.findMany({
      where: { remainingQuantity: { gt: 0 }, expiryDate: { gte: now, lte: in30Days } },
      include: { pharmacyItem: true },
    });

    // Un seul rappel par article (garde le lot dont l'échéance est la plus proche).
    const earliestByItem = new Map<string, (typeof expiringLots)[number]>();
    for (const lot of expiringLots) {
      if (!lot.pharmacyItem || !lot.expiryDate) continue;
      const existing = earliestByItem.get(lot.pharmacyItemId);
      if (!existing || !existing.expiryDate || lot.expiryDate < existing.expiryDate) {
        earliestByItem.set(lot.pharmacyItemId, lot);
      }
    }

    if (earliestByItem.size === 0) return;
    const { appEvents } = await import("./events");

    for (const lot of earliestByItem.values()) {
      const title = `Expiration proche : ${lot.pharmacyItem!.name}`;
      // Dédoublonnage quotidien (même pattern que sendDailyAgenda) : au plus une alerte par jour.
      const existingNotification = await prisma.notification.findFirst({
        where: { title, createdAt: { gte: startOfToday } },
      });
      if (existingNotification) continue;

      appEvents.emit("stock.expiring", {
        pharmacyItemId: lot.pharmacyItemId,
        itemName: lot.pharmacyItem!.name,
        expiryDate: lot.expiryDate!.toISOString(),
        organizationId: lot.organizationId,
      });

      console.log(`[Scheduler] Expiring stock alert emitted for ${lot.pharmacyItem!.name}`);
    }
  } catch (error) {
    console.error("Error checking expiring stock:", error);
  }
}

async function checkLowStock(now: Date) {
  try {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const items = await prisma.pharmacyItem.findMany({ where: { organizationId: { not: null } } });
    const belowThreshold = items.filter((item) => item.stockQuantity <= item.reorderLevel);
    if (belowThreshold.length === 0) return;

    const { appEvents } = await import("./events");

    for (const item of belowThreshold) {
      const title = `Rupture de stock : ${item.name}`;
      const existingNotification = await prisma.notification.findFirst({
        where: { title, createdAt: { gte: startOfToday } },
      });
      if (existingNotification) continue;

      appEvents.emit("stock.low", {
        pharmacyItemId: item.id,
        itemName: item.name,
        stockQuantity: item.stockQuantity,
        reorderLevel: item.reorderLevel,
        organizationId: item.organizationId,
      });

      console.log(`[Scheduler] Low stock safety-net alert emitted for ${item.name}`);
    }
  } catch (error) {
    console.error("Error checking low stock:", error);
  }
}
