import { describe, it, expect } from "vitest";
import { compareQueue, formatTicket, formatWait, nextVisitStatus } from "./visits";
import { clinicDateKey } from "./clinic-day";

describe("nextVisitStatus", () => {
  it("suit le parcours attente → appel → prise en charge → terminé", () => {
    expect(nextVisitStatus("WAITING", "CALL")).toBe("CALLED");
    expect(nextVisitStatus("CALLED", "START")).toBe("IN_PROGRESS");
    expect(nextVisitStatus("IN_PROGRESS", "COMPLETE")).toBe("DONE");
  });

  it("autorise la prise en charge directe, la remise en attente d'un absent et le départ", () => {
    expect(nextVisitStatus("WAITING", "START")).toBe("IN_PROGRESS");
    expect(nextVisitStatus("CALLED", "REQUEUE")).toBe("WAITING");
    expect(nextVisitStatus("IN_PROGRESS", "CANCEL")).toBe("CANCELLED");
  });

  it("refuse les transitions incohérentes", () => {
    expect(nextVisitStatus("WAITING", "COMPLETE")).toBeNull();
    expect(nextVisitStatus("DONE", "CALL")).toBeNull();
    expect(nextVisitStatus("CANCELLED", "START")).toBeNull();
    expect(nextVisitStatus("IN_PROGRESS", "CALL")).toBeNull();
  });
});

describe("ordre de la file", () => {
  it("place les urgences en tête, puis l'ordre d'arrivée", () => {
    const queue = [
      { id: "a", priority: "NORMAL", arrivedAt: "2026-10-12T08:00:00Z" },
      { id: "b", priority: "URGENT", arrivedAt: "2026-10-12T09:00:00Z" },
      { id: "c", priority: "NORMAL", arrivedAt: "2026-10-12T07:30:00Z" },
    ].sort(compareQueue);
    expect(queue.map((v) => v.id)).toEqual(["b", "c", "a"]);
  });
});

describe("affichage", () => {
  it("formate le ticket sur 3 chiffres et l'attente en minutes ou heures", () => {
    expect(formatTicket(7)).toBe("007");
    expect(formatTicket(1234)).toBe("1234");
    const now = new Date("2026-10-12T10:00:00Z");
    expect(formatWait("2026-10-12T09:48:00Z", now)).toBe("12 min");
    expect(formatWait("2026-10-12T08:55:00Z", now)).toBe("1 h 05");
  });
});

describe("clinicDateKey", () => {
  it("suit le jour de Douala, pas celui du serveur UTC", () => {
    // 23h30 UTC le 12 = 00h30 le 13 à Douala : nouveau jour, nouveaux tickets.
    expect(clinicDateKey(new Date("2026-10-12T23:30:00Z"), "Africa/Douala")).toBe("2026-10-13");
    expect(clinicDateKey(new Date("2026-10-12T22:30:00Z"), "Africa/Douala")).toBe("2026-10-12");
  });
});
