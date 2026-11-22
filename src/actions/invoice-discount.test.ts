import { describe, it, expect, vi, beforeEach } from "vitest";

const coordinator = { id: "coord1", role: "COORDINATOR", organizationId: "c1", organization: { type: "CLINIC" } };
const cashier = { id: "cash1", role: "CASHIER", organizationId: "c1", organization: { type: "CLINIC" } };
const items = [
  { type: "LAB", description: "NFS", quantity: 1, unitPrice: 10000, amount: 10000 },
  { type: "SERVICE", description: "Consultation", quantity: 1, unitPrice: 5000, amount: 5000 },
];

function setup(user: Record<string, unknown>, invoice: Record<string, unknown>, paid = 0) {
  vi.doMock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...invoice, ...data }));
  vi.doMock("@/lib/db", () => ({
    prisma: {
      pendingInvoice: { findUnique: vi.fn(async () => invoice), update },
      financialTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: paid } })) },
    },
  }));
  return { update };
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/org-scope", () => ({ assertOrganizationAccess: vi.fn(async () => {}), resolveTargetOrgId: vi.fn() }));
});

describe("applyInvoiceDiscount", () => {
  it("le responsable réduit l'examen d'un patient avant l'encaissement", async () => {
    const { update } = setup(coordinator, { id: "inv1", organizationId: "c1", status: "PENDING", items });
    const { applyInvoiceDiscount } = await import("./finance");

    const res = await applyInvoiceDiscount({ pendingInvoiceId: "inv1", discounts: [{ index: 0, discount: 3000, reason: "patient indigent" }] });

    expect(res.success).toBe(true);
    if (res.success) expect(res.data.total).toBe(12000);
    const saved = (update.mock.calls[0][0] as { data: { items: { amount: number; discount?: number }[] } }).data.items;
    expect(saved[0]).toMatchObject({ amount: 7000, discount: 3000, discountReason: "patient indigent" });
    expect(saved[1]).toEqual(items[1]);
  });

  it("refusé au caissier", async () => {
    setup(cashier, { id: "inv1", organizationId: "c1", status: "PENDING", items });
    const { applyInvoiceDiscount } = await import("./finance");
    const res = await applyInvoiceDiscount({ pendingInvoiceId: "inv1", discounts: [{ index: 0, discount: 3000, reason: "x" }] });
    expect(res.success).toBe(false);
  });

  it("refusé dès qu'un règlement a été reçu", async () => {
    setup(coordinator, { id: "inv1", organizationId: "c1", status: "PENDING", items }, 2000);
    const { applyInvoiceDiscount } = await import("./finance");
    const res = await applyInvoiceDiscount({ pendingInvoiceId: "inv1", discounts: [{ index: 0, discount: 3000, reason: "x" }] });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/avant tout encaissement/);
  });

  it("un ticket entièrement offert est soldé", async () => {
    const { update } = setup(coordinator, { id: "inv1", organizationId: "c1", status: "PENDING", items: [items[0]] });
    const { applyInvoiceDiscount } = await import("./finance");
    const res = await applyInvoiceDiscount({ pendingInvoiceId: "inv1", discounts: [{ index: 0, discount: 10000, reason: "offert" }] });
    expect(res.success && res.data.settled).toBe(true);
    expect((update.mock.calls[0][0] as { data: { status?: string } }).data.status).toBe("PAID");
  });
});
