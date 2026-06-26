import { prisma } from "./db";

let isRunning = false;

export function startScheduler() {
  console.log("⏰ Background scheduler initialized.");
  
  // Run immediately on start
  runSchedulerTasks().catch(err => console.error("Error in scheduler run:", err));

  // Run every 1 minute
  setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await runSchedulerTasks();
    } catch (error) {
      console.error("Scheduler task error:", error);
    } finally {
      isRunning = false;
    }
  }, 60000); // 60 seconds
}

async function runSchedulerTasks() {
  const now = new Date();
  
  // 1. DAILY AGENDA NOTIFICATIONS
  await sendDailyAgenda(now);

  // 2. APPOINTMENT REMINDERS
  await sendAppointmentReminders(now);
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
