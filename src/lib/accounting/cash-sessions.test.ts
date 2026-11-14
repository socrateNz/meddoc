import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { cashSessionEntries, expectedCash, isDrawerCash } = await import("./cash-sessions");

const at = (s: string) => new Date(s);
const session = (id: string, openedAt: string, closedAt: string | null, openingFloat: number, countedAmount: number | null, registerId = "r1") => ({
  id,
  registerId,
  registerName: "Caisse principale",
  openedAt: at(openedAt),
  closedAt: closedAt ? at(closedAt) : null,
  openingFloat,
  countedAmount,
  status: closedAt ? "CLOSED" : "OPEN",
});

describe("espèces du tiroir", () => {
  it("seules les espèces (ou sans moyen de paiement) sont dans le tiroir", () => {
    expect(isDrawerCash(null)).toBe(true);
    expect(isDrawerCash("CASH")).toBe(true);
    expect(isDrawerCash("MOBILE")).toBe(false);
  });
  it("attendu = fond + encaissements espèces − sorties", () => {
    const movements = [
      { cashSessionId: "s1", type: "INCOME", amount: 5000, paymentMethod: null },
      { cashSessionId: "s1", type: "INCOME", amount: 3000, paymentMethod: "MOBILE" },
      { cashSessionId: "s1", type: "EXPENSE", amount: 2000, paymentMethod: "CASH" },
      { cashSessionId: "s2", type: "INCOME", amount: 9999, paymentMethod: null },
    ];
    expect(expectedCash({ id: "s1", openingFloat: 1000 }, movements)).toBe(4000);
  });
});

describe("écritures des séances de caisse", () => {
  // Cas réel : fond de 37 050 à la première séance, 69 275 comptés puis réouverture à 0.
  const sessions = [
    session("s1", "2026-09-04T17:52:00Z", "2026-09-05T07:58:00Z", 37050, 42500),
    session("s2", "2026-09-05T08:11:00Z", "2026-09-05T16:53:00Z", 42500, 19050),
    session("s3", "2026-09-09T16:11:00Z", "2026-09-09T20:00:00Z", 19050, 69275),
    session("s4", "2026-09-10T07:42:00Z", null, 0, null),
  ];
  const movements = [
    { cashSessionId: "s1", type: "INCOME", amount: 5000, paymentMethod: null }, // attendu 42 050, compté 42 500 → +450
    { cashSessionId: "s2", type: "INCOME", amount: 19050, paymentMethod: null },
    { cashSessionId: "s2", type: "EXPENSE", amount: 42500, paymentMethod: "CASH" }, // attendu 19 050 = compté
    { cashSessionId: "s3", type: "INCOME", amount: 50000, paymentMethod: null }, // attendu 69 050, compté 69 275 → +225
  ];
  const entries = cashSessionEntries(sessions, movements);

  it("fond initial de la 1re séance : D 571 / C 104", () => {
    expect(entries.find((e) => e.sourceType === "CASH_OPENING")).toMatchObject({
      sourceId: "s1",
      lines: [{ account: "571", debit: 37050 }, { account: "104", credit: 37050 }],
    });
  });
  it("écarts de fermeture : excédent D 571 / C 758, rien quand compté = attendu", () => {
    const variances = entries.filter((e) => e.sourceType === "CASH_VARIANCE");
    expect(variances.map((e) => [e.sourceId, e.lines])).toEqual([
      ["s1", [{ account: "571", debit: 450 }, { account: "758", credit: 450 }]],
      ["s3", [{ account: "571", debit: 225 }, { account: "758", credit: 225 }]],
    ]);
  });
  it("argent sorti entre deux séances (69 275 comptés, réouverture à 0) : D 104 / C 571", () => {
    const handovers = entries.filter((e) => e.sourceType === "CASH_HANDOVER");
    expect(handovers.map((e) => [e.sourceId, e.lines])).toEqual([["s4", [{ account: "104", debit: 69275 }, { account: "571", credit: 69275 }]]]);
  });
  it("le solde de caisse retombe sur le compté à chaque fermeture", () => {
    // Mouvements des documents (règlements, sorties) + écritures de séance, jusqu'à la fermeture de s3.
    const docs = movements.reduce((s, m) => s + (m.type === "INCOME" ? m.amount : -m.amount), 0);
    const sessionsUpToS3 = entries
      .filter((e) => e.date <= at("2026-09-09T20:00:00Z"))
      .reduce((s, e) => s + e.lines.reduce((t, l) => t + (l.account === "571" ? Number(l.debit ?? 0) - Number(l.credit ?? 0) : 0), 0), 0);
    expect(docs + sessionsUpToS3).toBe(69275);
  });
  it("manquant à la fermeture : D 658 / C 571", () => {
    const e = cashSessionEntries([session("x", "2026-01-01T08:00:00Z", "2026-01-01T18:00:00Z", 0, 900)], [{ cashSessionId: "x", type: "INCOME", amount: 1000, paymentMethod: null }]);
    expect(e).toEqual([expect.objectContaining({ sourceType: "CASH_VARIANCE", lines: [{ account: "658", debit: 100 }, { account: "571", credit: 100 }] })]);
  });
});
