import { describe, it, expect } from "vitest";
import { alertLineStart, expectedDilation, partogramAlerts } from "./partogram";

const at = (h: number) => new Date(Date.UTC(2026, 10, 22, 8 + Math.floor(h), Math.round((h % 1) * 60))).toISOString();

describe("partogramme", () => {
  it("fait partir la ligne d'alerte de la première dilatation ≥ 4 cm, à 1 cm/heure", () => {
    const pts = [{ recordedAt: at(0), cervicalDilation: 3 }, { recordedAt: at(2), cervicalDilation: 4 }];
    const start = alertLineStart(pts)!;
    expect(start.cm).toBe(4);
    expect(expectedDilation(start, start.at + 3 * 3600_000)).toBe(7);
    expect(expectedDilation(start, start.at + 9 * 3600_000)).toBe(10);
  });

  it("ne signale rien pour un travail qui progresse normalement", () => {
    expect(partogramAlerts([{ recordedAt: at(0), cervicalDilation: 4 }, { recordedAt: at(3), cervicalDilation: 7, fetalHeartRate: 140 }])).toEqual([]);
  });

  it("signale la ligne d'alerte puis la ligne d'action franchies", () => {
    const alert = partogramAlerts([{ recordedAt: at(0), cervicalDilation: 4 }, { recordedAt: at(3), cervicalDilation: 5 }]);
    expect(alert.map((a) => a.message)).toEqual([expect.stringMatching(/Ligne d'alerte/)]);
    const action = partogramAlerts([{ recordedAt: at(0), cervicalDilation: 4 }, { recordedAt: at(7), cervicalDilation: 6 }]);
    expect(action[0]).toMatchObject({ level: "danger", message: expect.stringMatching(/Ligne d'action/) });
  });

  it("signale un cœur fœtal anormal, un liquide méconial et une tension élevée", () => {
    const alerts = partogramAlerts([{ recordedAt: at(0), fetalHeartRate: 100, amnioticFluid: "M", systolicBp: 150, diastolicBp: 95 }]);
    expect(alerts.map((a) => a.message)).toEqual([
      expect.stringMatching(/fœtal anormal/),
      expect.stringMatching(/méconial/),
      expect.stringMatching(/Tension élevée/),
    ]);
  });
});
