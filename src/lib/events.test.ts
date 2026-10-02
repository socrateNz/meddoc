import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("incident.created — isolation multi-tenant", () => {
  it("ne notifie que les coordinateurs de la clinique du patient concerné, jamais d'une autre clinique", async () => {
    let notifiedIds: string[] = [];
    const notificationCreateMany = vi.fn(async ({ data }: any) => { notifiedIds = data.map((n: any) => n.userId); return { count: data.length }; });
    const userFindMany = vi.fn(async ({ where }: any) => {
      const pool = [
        { id: "coordA", role: "COORDINATOR", organizationId: "clinicA", isActive: true },
        { id: "coordB", role: "COORDINATOR", organizationId: "clinicB", isActive: true },
      ];
      return pool.filter((u) => u.organizationId === where.organizationId);
    });

    vi.doMock("./db", () => ({
      prisma: {
        user: { findMany: userFindMany },
        patient: {
          findUnique: vi.fn(async () => ({ id: "p1", user: { firstName: "Marie", lastName: "Kouassi" } })),
        },
        notification: { createMany: notificationCreateMany },
        pushSubscription: { findMany: vi.fn(async () => []) },
      },
    }));

    const { appEvents } = await import("./events");

    appEvents.emit("incident.created", {
      incidentId: "inc1",
      patientId: "p1",
      title: "Chute",
      organizationId: "clinicA",
    });

    await vi.waitFor(() => expect(notificationCreateMany).toHaveBeenCalled());

    expect(notifiedIds).toEqual(["coordA"]);
    expect(notifiedIds).not.toContain("coordB");
  });

  it("ne notifie personne quand l'incident n'a pas d'organisation résolue", async () => {
    const notificationCreateMany = vi.fn(async () => ({ count: 0 }));
    const userFindMany = vi.fn(async () => []);

    vi.doMock("./db", () => ({
      prisma: {
        user: { findMany: userFindMany },
        patient: { findUnique: vi.fn(async () => null) },
        notification: { createMany: notificationCreateMany },
        pushSubscription: { findMany: vi.fn(async () => []) },
      },
    }));

    const { appEvents } = await import("./events");

    appEvents.emit("incident.created", {
      incidentId: "inc1",
      patientId: "p1",
      title: "Chute",
      organizationId: null,
    });

    // Laisse le temps à un éventuel appel asynchrone incorrect de se déclencher.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(userFindMany).not.toHaveBeenCalled();
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });
});

describe("appointment.scheduled — notifie aussi le patient, pas seulement le soignant", () => {
  it("notifie le patient ET le soignant assigné", async () => {
    let notifiedIds: string[] = [];
    const notificationCreateMany = vi.fn(async ({ data }: { data: { userId: string }[] }) => {
      notifiedIds = data.map((n) => n.userId);
      return { count: data.length };
    });

    vi.doMock("./db", () => ({
      prisma: {
        patient: {
          findUnique: vi.fn(async () => ({ userId: "userPatient1", user: { firstName: "Awa", lastName: "Mballa" } })),
        },
        caregiver: {
          findUnique: vi.fn(async () => ({ userId: "userCaregiver1", user: { firstName: "Jean", lastName: "Fotso" } })),
        },
        notification: { createMany: notificationCreateMany },
        pushSubscription: { findMany: vi.fn(async () => []) },
      },
    }));

    const { appEvents } = await import("./events");

    appEvents.emit("appointment.scheduled", {
      appointmentId: "apt1",
      patientId: "p1",
      caregiverId: "car1",
      title: "Consultation de suivi",
      scheduledAt: new Date().toISOString(),
    });

    await vi.waitFor(() => expect(notificationCreateMany).toHaveBeenCalled());

    expect(notifiedIds).toEqual(["userPatient1", "userCaregiver1"]);
  });

  it("notifie uniquement le patient quand aucun soignant n'est encore assigné (caregiverId null)", async () => {
    let notifiedIds: string[] = [];
    const notificationCreateMany = vi.fn(async ({ data }: { data: { userId: string }[] }) => {
      notifiedIds = data.map((n) => n.userId);
      return { count: data.length };
    });
    const caregiverFindUnique = vi.fn();

    vi.doMock("./db", () => ({
      prisma: {
        patient: {
          findUnique: vi.fn(async () => ({ userId: "userPatient1", user: { firstName: "Awa", lastName: "Mballa" } })),
        },
        caregiver: { findUnique: caregiverFindUnique },
        notification: { createMany: notificationCreateMany },
        pushSubscription: { findMany: vi.fn(async () => []) },
      },
    }));

    const { appEvents } = await import("./events");

    appEvents.emit("appointment.scheduled", {
      appointmentId: "apt1",
      patientId: "p1",
      caregiverId: null,
      title: "Consultation de suivi",
      scheduledAt: new Date().toISOString(),
    });

    await vi.waitFor(() => expect(notificationCreateMany).toHaveBeenCalled());

    expect(notifiedIds).toEqual(["userPatient1"]);
    expect(caregiverFindUnique).not.toHaveBeenCalled();
  });
});
