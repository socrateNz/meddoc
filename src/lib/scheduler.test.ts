import { describe, it, expect, vi, beforeEach } from "vitest";

// Même principe que src/lib/events.test.ts : on mocke aux frontières (db, notifyUsers) pour
// tester la logique de sélection/dédoublonnage des rappels sans base réelle.

beforeEach(() => {
  vi.resetModules();
});

type NotifyEntry = { userId: string; title: string; message: string; type: string };

interface FakeAppointment {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date;
  patient: { userId: string; user: { firstName: string; lastName: string } };
  caregiver: { userId: string; user: { firstName: string } } | null;
}

const BASE_APPOINTMENT = {
  id: "apt1",
  title: "Consultation de suivi",
  status: "SCHEDULED",
  patient: { userId: "userPatient1", user: { firstName: "Awa", lastName: "Mballa" } },
};

function mockDb({
  appointments,
  existingNotificationUserIds = [],
}: {
  appointments: FakeAppointment[];
  existingNotificationUserIds?: string[];
}) {
  const notificationFindFirst = vi.fn(async ({ where }: { where: { userId: string; title: string } }) =>
    existingNotificationUserIds.includes(where.userId) ? { id: "existing" } : null
  );
  vi.doMock("./db", () => ({
    prisma: {
      appointment: { findMany: vi.fn(async () => appointments) },
      notification: { findFirst: notificationFindFirst },
    },
  }));
  return { notificationFindFirst };
}

describe("sendAppointmentReminders", () => {
  it("notifie à la fois le soignant assigné et le patient, 24h avant le rendez-vous", async () => {
    const notifyUsers = vi.fn();
    vi.doMock("./events", () => ({ notifyUsers }));
    mockDb({
      appointments: [
        {
          ...BASE_APPOINTMENT,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          caregiver: { userId: "userCaregiver1", user: { firstName: "Jean" } },
        },
      ],
    });

    const { sendAppointmentReminders } = await import("./scheduler");
    await sendAppointmentReminders(new Date());

    expect(notifyUsers).toHaveBeenCalledTimes(1);
    const entries = notifyUsers.mock.calls[0][0] as NotifyEntry[];
    const userIds = entries.map((e) => e.userId);
    expect(userIds).toContain("userCaregiver1");
    expect(userIds).toContain("userPatient1");
    expect(entries.find((e) => e.userId === "userPatient1")?.message).toMatch(/Awa/);
  });

  it("notifie uniquement le patient quand aucun soignant n'est encore assigné", async () => {
    const notifyUsers = vi.fn();
    vi.doMock("./events", () => ({ notifyUsers }));
    mockDb({
      appointments: [
        {
          ...BASE_APPOINTMENT,
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          caregiver: null,
        },
      ],
    });

    const { sendAppointmentReminders } = await import("./scheduler");
    await sendAppointmentReminders(new Date());

    expect(notifyUsers).toHaveBeenCalledTimes(1);
    const entries = notifyUsers.mock.calls[0][0] as NotifyEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe("userPatient1");
  });

  it("ne renvoie pas un rappel déjà envoyé à un destinataire (dédoublonnage par userId+titre), mais le renvoie bien à l'autre", async () => {
    const notifyUsers = vi.fn();
    vi.doMock("./events", () => ({ notifyUsers }));
    mockDb({
      appointments: [
        {
          ...BASE_APPOINTMENT,
          scheduledAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
          caregiver: { userId: "userCaregiver1", user: { firstName: "Jean" } },
        },
      ],
      existingNotificationUserIds: ["userCaregiver1"],
    });

    const { sendAppointmentReminders } = await import("./scheduler");
    await sendAppointmentReminders(new Date());

    expect(notifyUsers).toHaveBeenCalledTimes(1);
    const entries = notifyUsers.mock.calls[0][0] as NotifyEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBe("userPatient1");
  });

  it("n'envoie rien quand aucun rendez-vous ne tombe dans une fenêtre de rappel", async () => {
    const notifyUsers = vi.fn();
    vi.doMock("./events", () => ({ notifyUsers }));
    mockDb({
      appointments: [
        {
          ...BASE_APPOINTMENT,
          scheduledAt: new Date(Date.now() + 10 * 60 * 60 * 1000), // ne tombe sur aucune fenêtre (24h/2h/1h)
          caregiver: { userId: "userCaregiver1", user: { firstName: "Jean" } },
        },
      ],
    });

    const { sendAppointmentReminders } = await import("./scheduler");
    await sendAppointmentReminders(new Date());

    expect(notifyUsers).not.toHaveBeenCalled();
  });
});
