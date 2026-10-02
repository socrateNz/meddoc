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

        const { notifyUsers } = await import("./events");
        await notifyUsers([
          {
            userId: caregiver.userId,
            title: `📅 Votre agenda du jour (${todayString})`,
            message: `Bonjour ${caregiver.user.firstName}, vous avez ${appointments.length} intervention(s) aujourd'hui :\n${listText}`,
            type: "APPOINTMENT",
          },
        ]);

        console.log(`[Scheduler] Daily agenda sent to caregiver ${caregiver.user.lastName} (${caregiver.userId})`);
      }
    }
  } catch (error) {
    console.error("Error sending daily agenda:", error);
  }
}

// Rappels avant rendez-vous — au soignant assigné (s'il y en a un) ET au patient lui-même (son
// propre compte, cf. Patient.userId). Avant ce correctif, seul le soignant était prévenu : un
// patient qui ne consulte pas spontanément le tableau de bord n'avait alors aucun moyen d'être
// relancé avant sa visite — cause fréquente de rendez-vous manqués. Un rendez-vous sans soignant
// assigné n'est donc plus totalement exclu : le patient doit quand même être relancé.
// Exportée (seule fonction de ce fichier à l'être avec runSchedulerTasks) pour être testée
// directement — cf. scheduler.test.ts — plutôt qu'à travers runSchedulerTasks, qui mélangerait
// ses effets avec ceux de sendDailyAgenda/checkExpiringStock/checkLowStock dans le même test.
export async function sendAppointmentReminders(now: Date) {
  try {
    // Look for appointments scheduled within the next 25 hours
    const maxTime = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const appointments = await prisma.appointment.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          gte: now,
          lte: maxTime
        }
      },
      include: {
        caregiver: { include: { user: true } },
        patient: { include: { user: true } }
      }
    });

    const { notifyUsers } = await import("./events");

    for (const app of appointments) {
      const diffMs = app.scheduledAt.getTime() - now.getTime();
      const diffHours = diffMs / (60 * 60 * 1000);

      // Define reminder configurations
      const reminders = [
        { key: "24h", label: "24 heures", minHour: 23.5, maxHour: 24.5 },
        { key: "2h", label: "2 heures", minHour: 1.8, maxHour: 2.2 },
        { key: "1h", label: "1 heure", minHour: 0.8, maxHour: 1.2 },
      ];

      for (const rem of reminders) {
        if (diffHours < rem.minHour || diffHours > rem.maxHour) continue;

        // Même libellé pour les deux destinataires (comme avant ce correctif pour le soignant) :
        // le dédoublonnage ci-dessous est scopé par userId, donc aucune collision entre eux, et
        // la présence du titre du rendez-vous évite déjà la plupart des collisions entre deux
        // rendez-vous distincts d'un même destinataire au même créneau de rappel.
        const reminderTitle = `⏰ Rappel ${rem.label} : ${app.title}`;
        const timeStr = app.scheduledAt.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
        const entries: { userId: string; title: string; message: string; type: string }[] = [];

        if (app.caregiver?.user) {
          const existing = await prisma.notification.findFirst({
            where: { userId: app.caregiver.userId, title: reminderTitle }
          });
          if (!existing) {
            const patientName = `${app.patient.user.lastName} ${app.patient.user.firstName}`;
            entries.push({
              userId: app.caregiver.userId,
              title: reminderTitle,
              message: `Rappel : Votre intervention "${app.title}" pour le patient ${patientName} est planifiée dans ${rem.label} (à ${timeStr}).`,
              type: "APPOINTMENT"
            });
          }
        }

        if (app.patient?.user) {
          const existing = await prisma.notification.findFirst({
            where: { userId: app.patient.userId, title: reminderTitle }
          });
          if (!existing) {
            entries.push({
              userId: app.patient.userId,
              title: reminderTitle,
              message: `Bonjour ${app.patient.user.firstName}, rappel : votre rendez-vous "${app.title}" est prévu dans ${rem.label} (à ${timeStr}).`,
              type: "APPOINTMENT"
            });
          }
        }

        if (entries.length > 0) {
          await notifyUsers(entries);
          console.log(`[Scheduler] Reminder (${rem.key}) sent for appointment ${app.id} to ${entries.map((e) => e.userId).join(", ")}`);
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
