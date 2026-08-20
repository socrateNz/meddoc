import { describe, it, expect, vi, beforeEach } from "vitest";

// finalizePendingInvoice appelle recordMultiItemInvoice dans le même module (donc pas
// mockable séparément) : on fournit un panier SERVICE-only pour éviter toute la mécanique
// de décompte de stock pharmacie (déjà couverte par stock.test.ts) et se concentrer sur le
// point testé ici — le déblocage de la demande labo liée une fois la facture finalisée.
const activeUser = { id: "user1", role: "COORDINATOR", organizationId: "org1" };

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/auth", () => ({
    getCurrentUser: vi.fn(async () => activeUser),
  }));
});

describe("finalizePendingInvoice", () => {
  it("passe les demandes d'analyse liées de PENDING à PAID une fois la facture finalisée", async () => {
    const labOrderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const pendingInvoiceUpdate = vi.fn(async () => ({}));

    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "PENDING", patientId: "p1", organizationId: "org1" })),
          update: pendingInvoiceUpdate,
        },
        financialTransaction: {
          create: vi.fn(async ({ data }: any) => ({ id: "tx1", ...data })),
        },
        labOrder: { updateMany: labOrderUpdateMany },
      },
    }));
    const { finalizePendingInvoice } = await import("./finance");

    const result = await finalizePendingInvoice("inv1", [
      { type: "SERVICE", description: "Frais de consultation", quantity: 1, unitPrice: 0, amount: 0 },
    ]);

    expect(result.success).toBe(true);
    expect(pendingInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1" }, data: expect.objectContaining({ status: "FINALIZED" }) })
    );
    expect(labOrderUpdateMany).toHaveBeenCalledWith({
      where: { pendingInvoiceId: "inv1", paymentStatus: "PENDING" },
      data: { paymentStatus: "PAID" },
    });
  });

  it("refuse de finaliser une facture déjà finalisée", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        pendingInvoice: {
          findUnique: vi.fn(async () => ({ id: "inv1", status: "FINALIZED" })),
        },
      },
    }));
    const { finalizePendingInvoice } = await import("./finance");

    const result = await finalizePendingInvoice("inv1", []);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/déjà été finalisée/);
  });
});
