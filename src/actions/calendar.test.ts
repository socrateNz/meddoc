import { describe, it, expect, vi, beforeEach } from "vitest";

// Même principe que src/actions/appointments.test.ts : on mocke aux frontières (@/lib/db,
// @/lib/auth) pour tester le ROUTAGE PAR RÔLE de getCalendarItems sans base réelle — c'est la
// partie la plus importante à couvrir (cf. plan « Calendrier unifié ») : qui voit quoi, et
// surtout que CalendarEvent ne bascule JAMAIS en vue org-wide, même pour COORDINATOR.

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user1",
    role: "CAREGIVER",
    organizationId: "org1",
    organization: { type: "CLINIC" },
    ...overrides,
  };
}

type FindManyArgs = { where: Record<string, unknown> };

function mockDb(overrides: Record<string, unknown> = {}) {
  const appointmentFindMany = vi.fn(async (_args: FindManyArgs) => []);
  const shiftFindMany = vi.fn(async (_args: FindManyArgs) => []);
  const calendarEventFindMany = vi.fn(async (_args: FindManyArgs) => []);
  const careTaskFindMany = vi.fn(async (_args: FindManyArgs) => []);
  const contractFindMany = vi.fn(async (_args: FindManyArgs) => []);
  const stockPurchaseFindMany = vi.fn(async (_args: FindManyArgs) => []);
  const caregiverFindUnique = vi.fn(async () => ({ id: "caregiver1" }));

  const mocks = {
    appointmentFindMany,
    shiftFindMany,
    calendarEventFindMany,
    careTaskFindMany,
    contractFindMany,
    stockPurchaseFindMany,
    caregiverFindUnique,
  };

  vi.doMock("@/lib/db", () => ({
    prisma: {
      appointment: { findMany: appointmentFindMany },
      shift: { findMany: shiftFindMany },
      calendarEvent: { findMany: calendarEventFindMany },
      careTask: { findMany: careTaskFindMany },
      contract: { findMany: contractFindMany },
      stockPurchase: { findMany: stockPurchaseFindMany },
      caregiver: { findUnique: caregiverFindUnique },
      ...overrides,
    },
  }));

  return mocks;
}

function mockAuth(user: ReturnType<typeof baseUser>) {
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("getCalendarItems — routage par rôle", () => {
  it("COORDINATOR : org-wide pour rendez-vous/gardes/tâches/contrats/stock, mais CalendarEvent reste privé (userId uniquement)", async () => {
    const mocks = mockDb();
    mockAuth(baseUser({ role: "COORDINATOR" }));

    const { getCalendarItems } = await import("./calendar");
    const res = await getCalendarItems();

    expect(res.success).toBe(true);
    // Org-wide : pas de filtre "mien ou non affecté" sur rendez-vous/tâches.
    const apptWhere = mocks.appointmentFindMany.mock.calls[0][0].where;
    expect(apptWhere.OR).toBeUndefined();
    const taskWhere = mocks.careTaskFindMany.mock.calls[0][0].where;
    expect(taskWhere.OR).toBeUndefined();
    // Contrats et stock interrogés (COORDINATOR est dans les deux listes de rôles).
    expect(mocks.contractFindMany).toHaveBeenCalled();
    expect(mocks.stockPurchaseFindMany).toHaveBeenCalled();
    // CalendarEvent : toujours filtré sur userId, jamais élargi même pour COORDINATOR.
    const eventWhere = mocks.calendarEventFindMany.mock.calls[0][0].where;
    expect(eventWhere).toEqual({ userId: "user1" });
  });

  it("CAREGIVER : rendez-vous/tâches limités à 'mien ou non affecté', jamais de contrats ni de stock interrogés", async () => {
    const mocks = mockDb();
    mockAuth(baseUser({ role: "CAREGIVER" }));

    const { getCalendarItems } = await import("./calendar");
    await getCalendarItems();

    const apptWhere = mocks.appointmentFindMany.mock.calls[0][0].where;
    expect(apptWhere.OR).toEqual([{ caregiverId: "caregiver1" }, { caregiverId: null }]);
    const taskWhere = mocks.careTaskFindMany.mock.calls[0][0].where;
    expect(taskWhere.OR).toEqual([{ caregiverId: "caregiver1" }, { caregiverId: null }]);
    // Hors de CONTRACT_DEADLINE_ROLES / STOCK_EXPIRY_ROLES : jamais interrogés du tout.
    expect(mocks.contractFindMany).not.toHaveBeenCalled();
    expect(mocks.stockPurchaseFindMany).not.toHaveBeenCalled();
    // Gardes/événements : toujours scopés à soi-même pour un rôle non org-wide.
    expect(mocks.shiftFindMany.mock.calls[0][0].where).toEqual({ userId: "user1" });
    expect(mocks.calendarEventFindMany.mock.calls[0][0].where).toEqual({ userId: "user1" });
  });

  it("PHARMACIST : voit le stock (org-wide) et ses propres gardes/événements, jamais les rendez-vous/tâches/contrats", async () => {
    const mocks = mockDb();
    mockAuth(baseUser({ role: "PHARMACIST" }));

    const { getCalendarItems } = await import("./calendar");
    await getCalendarItems();

    expect(mocks.appointmentFindMany).not.toHaveBeenCalled();
    expect(mocks.careTaskFindMany).not.toHaveBeenCalled();
    expect(mocks.contractFindMany).not.toHaveBeenCalled();
    expect(mocks.stockPurchaseFindMany).toHaveBeenCalled();
    expect(mocks.shiftFindMany.mock.calls[0][0].where).toEqual({ userId: "user1" });
  });

  it("CASHIER : uniquement ses propres gardes/événements, aucune des 4 autres sources interrogée", async () => {
    const mocks = mockDb();
    mockAuth(baseUser({ role: "CASHIER" }));

    const { getCalendarItems } = await import("./calendar");
    await getCalendarItems();

    expect(mocks.appointmentFindMany).not.toHaveBeenCalled();
    expect(mocks.careTaskFindMany).not.toHaveBeenCalled();
    expect(mocks.contractFindMany).not.toHaveBeenCalled();
    expect(mocks.stockPurchaseFindMany).not.toHaveBeenCalled();
    expect(mocks.shiftFindMany).toHaveBeenCalled();
    expect(mocks.calendarEventFindMany).toHaveBeenCalled();
  });

  it("rôle hors périmètre (ex: PATIENT) : ne requête rien du tout, renvoie une liste vide", async () => {
    const mocks = mockDb();
    mockAuth(baseUser({ role: "PATIENT", organization: null }));

    const { getCalendarItems } = await import("./calendar");
    const res = await getCalendarItems();

    expect(res).toEqual({ success: true, data: [] });
    expect(mocks.appointmentFindMany).not.toHaveBeenCalled();
    expect(mocks.shiftFindMany).not.toHaveBeenCalled();
    expect(mocks.calendarEventFindMany).not.toHaveBeenCalled();
  });

  it("une garde n'est éditable que pour COORDINATOR, jamais pour son simple affecté", async () => {
    mockDb({
      shift: {
        findMany: vi.fn(async () => [
          {
            id: "shift1",
            userId: "user1",
            createdById: "coord1",
            title: "Garde de nuit",
            startAt: new Date("2026-01-01T20:00:00Z"),
            endAt: new Date("2026-01-02T06:00:00Z"),
            notes: null,
            user: { firstName: "Jean", lastName: "Fotso" },
          },
        ]),
      },
    });
    mockAuth(baseUser({ role: "CAREGIVER" }));

    const { getCalendarItems } = await import("./calendar");
    const res = await getCalendarItems();

    expect(res.success).toBe(true);
    const shiftItem = res.data?.find((i) => i.kind === "SHIFT");
    expect(shiftItem?.canEdit).toBe(false);
  });
});
