import { describe, it, expect } from "vitest";
import { comparePrenatalFollowUp, isPrenatalLabTest, prenatalFollowUp } from "./maternity-labels";

const today = new Date(2026, 10, 18); // 18 nov. 2026
const pregnancy = (extra: Record<string, unknown> = {}) => ({
  lastMenstrualPeriod: new Date(2026, 5, 1),
  expectedDueDate: new Date(2027, 2, 8),
  ...extra,
});

describe("prenatalFollowUp", () => {
  it("calcule l'âge gestationnel depuis la DDR", () => {
    expect(prenatalFollowUp(pregnancy(), today).gestationalWeeks).toBe(24);
  });

  it("signale une grossesse sans aucune visite", () => {
    expect(prenatalFollowUp(pregnancy(), today).status).toBe("NO_VISIT");
  });

  it("signale une CPN manquée avec le nombre de jours de retard", () => {
    const r = prenatalFollowUp(pregnancy({ lastVisit: { visitDate: new Date(2026, 9, 1), nextVisitDate: new Date(2026, 10, 8) } }), today);
    expect(r).toMatchObject({ status: "OVERDUE", daysLate: 10 });
  });

  it("distingue la CPN de la semaine, le RDV plus lointain et l'absence de RDV", () => {
    const visit = (next: Date | null) => pregnancy({ lastVisit: { visitDate: new Date(2026, 9, 1), nextVisitDate: next } });
    expect(prenatalFollowUp(visit(new Date(2026, 10, 18)), today).status).toBe("DUE_SOON");
    expect(prenatalFollowUp(visit(new Date(2026, 10, 25)), today).status).toBe("DUE_SOON");
    expect(prenatalFollowUp(visit(new Date(2026, 11, 10)), today).status).toBe("SCHEDULED");
    expect(prenatalFollowUp(visit(null), today).status).toBe("NO_APPOINTMENT");
  });

  it("passe en « terme dépassé » après la DPA, même avec un RDV prévu", () => {
    const r = prenatalFollowUp(
      pregnancy({ expectedDueDate: new Date(2026, 10, 11), lastVisit: { visitDate: new Date(2026, 10, 1), nextVisitDate: new Date(2026, 10, 30) } }),
      today
    );
    expect(r).toMatchObject({ status: "TERM_PASSED", daysLate: 7 });
  });

  it("trie les plus urgentes d'abord, puis le plus gros retard", () => {
    const rows = [
      { status: "SCHEDULED" as const, daysLate: 0 },
      { status: "OVERDUE" as const, daysLate: 3 },
      { status: "TERM_PASSED" as const, daysLate: 1 },
      { status: "OVERDUE" as const, daysLate: 20 },
    ].sort(comparePrenatalFollowUp);
    expect(rows.map((r) => `${r.status}:${r.daysLate}`)).toEqual(["TERM_PASSED:1", "OVERDUE:20", "OVERDUE:3", "SCHEDULED:0"]);
  });
});

describe("isPrenatalLabTest", () => {
  it("reconnaît les examens du bilan prénatal quel que soit le libellé du catalogue", () => {
    expect(isPrenatalLabTest("NFS")).toBe(true);
    expect(isPrenatalLabTest("Groupe sanguin + Rhésus")).toBe(true);
    expect(isPrenatalLabTest("Sérologie VIH")).toBe(true);
    expect(isPrenatalLabTest("Goutte épaisse")).toBe(false);
  });
});
