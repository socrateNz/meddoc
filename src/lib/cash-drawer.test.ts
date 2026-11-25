import { describe, expect, it, vi } from "vitest";
import { assertDrawerNotOverdrawn, drawerCashBalance } from "./cash-drawer";

// Tiroir fictif : fond, encaissements (dont une part hors espèces) et sorties de la séance.
function fakeClient({ openingFloat = 0, income = 0, nonCashIncome = 0, expenses = 0 }) {
  return {
    cashSession: { findUnique: vi.fn(async () => ({ openingFloat })), update: vi.fn(async () => ({})) },
    financialTransaction: {
      aggregate: vi.fn(async ({ where }: any) => ({
        _sum: { amount: where.type === "EXPENSE" ? expenses : where.paymentMethod ? nonCashIncome : income },
      })),
    },
  };
}

describe("drawerCashBalance", () => {
  it("fond + encaissements en espèces − sorties (Mobile Money, carte… hors tiroir)", async () => {
    const client = fakeClient({ openingFloat: 10000, income: 25000, nonCashIncome: 5000, expenses: 8000 });
    expect(await drawerCashBalance(client, "s1")).toBe(22000);
  });
});

describe("assertDrawerNotOverdrawn", () => {
  it("accepte une sortie qui vide exactement le tiroir", async () => {
    const client = fakeClient({ openingFloat: 5000, income: 5000, expenses: 10000 });
    await expect(assertDrawerNotOverdrawn(client, "s1", 10000)).resolves.toBeUndefined();
  });

  it("refuse une sortie supérieure aux espèces disponibles, avec le disponible dans le message", async () => {
    // 15 000 F dans le tiroir avant la sortie de 20 000 F (déjà comptée dans expenses).
    const client = fakeClient({ openingFloat: 5000, income: 10000, expenses: 20000 });
    await expect(assertDrawerNotOverdrawn(client, "s1", 20000)).rejects.toThrow(/15\s000 FCFA disponibles/);
  });

  it("ne compte pas les encaissements Mobile Money comme des espèces disponibles", async () => {
    const client = fakeClient({ openingFloat: 0, income: 30000, nonCashIncome: 30000, expenses: 1000 });
    await expect(assertDrawerNotOverdrawn(client, "s1", 1000)).rejects.toThrow(/Fonds insuffisants/);
  });

  it("réécrit la séance pour sérialiser deux sorties simultanées", async () => {
    const client = fakeClient({ openingFloat: 5000, expenses: 1000 });
    await assertDrawerNotOverdrawn(client, "s1", 1000);
    expect(client.cashSession.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { openingFloat: 5000 } });
  });
});
