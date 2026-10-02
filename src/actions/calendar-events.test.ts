import { describe, it, expect, vi, beforeEach } from "vitest";

// Priorité : propriété stricte (un utilisateur ne peut jamais modifier/supprimer l'événement
// d'un autre) + userId toujours fixé côté serveur, jamais accepté depuis le client (cf. plan
// « Calendrier unifié »).

const userA = { id: "userA", role: "CAREGIVER" };

function mockDb(existingOwnerId: string = "userA") {
  const calendarEventCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "event1", ...data }));
  const calendarEventUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "event1", ...data }));
  const calendarEventDelete = vi.fn(async () => ({ id: "event1" }));
  const calendarEventFindUnique = vi.fn(async () => ({ id: "event1", userId: existingOwnerId }));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      calendarEvent: {
        create: calendarEventCreate,
        update: calendarEventUpdate,
        delete: calendarEventDelete,
        findUnique: calendarEventFindUnique,
      },
    },
  }));
  return { calendarEventCreate, calendarEventUpdate, calendarEventDelete };
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
});

describe("createCalendarEvent", () => {
  it("fixe toujours userId côté serveur à l'utilisateur courant, même si le payload n'en porte pas", async () => {
    const { calendarEventCreate } = mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => userA) }));
    const { createCalendarEvent } = await import("./calendar-events");

    const res = await createCalendarEvent({ title: "Réunion d'équipe", startAt: "2026-01-01T10:00:00Z" });

    expect(res.success).toBe(true);
    expect(calendarEventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "userA" }) }));
  });
});

describe("updateCalendarEvent / deleteCalendarEvent — propriété stricte", () => {
  it("userA ne peut pas modifier un événement appartenant à userB", async () => {
    mockDb("userB");
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => userA) }));
    const { updateCalendarEvent } = await import("./calendar-events");

    const res = await updateCalendarEvent({ id: "event1", title: "Modifié" });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/non autorisé/i);
  });

  it("userA ne peut pas supprimer un événement appartenant à userB", async () => {
    const { calendarEventDelete } = mockDb("userB");
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => userA) }));
    const { deleteCalendarEvent } = await import("./calendar-events");

    const res = await deleteCalendarEvent("event1");

    expect(res.success).toBe(false);
    expect(calendarEventDelete).not.toHaveBeenCalled();
  });

  it("userA peut modifier son propre événement", async () => {
    mockDb();
    vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => userA) }));
    const { updateCalendarEvent } = await import("./calendar-events");

    const res = await updateCalendarEvent({ id: "event1", title: "Modifié" });

    expect(res.success).toBe(true);
  });
});
