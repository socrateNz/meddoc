import { describe, it, expect } from "vitest";
import { compareEmergency, isPlausibleBloodPressure, triageDelay, triageLevelInfo } from "./triage";

describe("triageDelay", () => {
  const arrived = "2026-10-13T08:00:00.000Z";

  it("signale le dépassement du délai cible du niveau", () => {
    expect(triageDelay(2, arrived, new Date("2026-10-13T08:15:00.000Z"))).toEqual({ waitedMinutes: 15, overdue: false });
    expect(triageDelay(2, arrived, new Date("2026-10-13T08:21:00.000Z"))).toEqual({ waitedMinutes: 21, overdue: true });
    expect(triageDelay(1, arrived, new Date("2026-10-13T08:01:00.000Z")).overdue).toBe(true);
    expect(triageDelay(5, arrived, new Date("2026-10-13T11:00:00.000Z")).overdue).toBe(false);
  });

  it("ne calcule pas de dépassement sans niveau", () => {
    expect(triageDelay(null, arrived, new Date("2026-10-13T12:00:00.000Z"))).toEqual({ waitedMinutes: 240, overdue: false });
    expect(triageLevelInfo(6)).toBeNull();
  });
});

describe("compareEmergency", () => {
  it("place les non-triés en tête, puis par niveau, puis par arrivée", () => {
    const rows = [
      { id: "a", triageLevel: 3, arrivedAt: "2026-10-13T08:00:00Z" },
      { id: "b", triageLevel: 1, arrivedAt: "2026-10-13T09:00:00Z" },
      { id: "c", triageLevel: null, arrivedAt: "2026-10-13T09:30:00Z" },
      { id: "d", triageLevel: 3, arrivedAt: "2026-10-13T07:00:00Z" },
    ];
    expect([...rows].sort(compareEmergency).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("isPlausibleBloodPressure", () => {
  it("accepte une tension systolique/diastolique vraisemblable", () => {
    expect(isPlausibleBloodPressure("120/80")).toBe(true);
    expect(isPlausibleBloodPressure(" 90 / 60 ")).toBe(true);
  });

  it("refuse les fautes de frappe et les valeurs inversées", () => {
    expect(isPlausibleBloodPressure("12/8")).toBe(false);
    expect(isPlausibleBloodPressure("80/120")).toBe(false);
    expect(isPlausibleBloodPressure("1200/80")).toBe(false);
    expect(isPlausibleBloodPressure("abc")).toBe(false);
  });
});
