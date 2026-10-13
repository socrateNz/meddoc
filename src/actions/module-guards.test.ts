import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModuleKey } from "@/lib/modules";

// Chaque module de la licence refuse ses actions serveur quand il est désactivé pour la holding
// de l'utilisateur — AVANT tout accès à la base (le client Prisma simulé échoue s'il est touché).
const state = vi.hoisted(() => ({ disabled: [] as string[], role: "COORDINATOR" }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    id: "u1",
    role: state.role,
    organizationId: "clinicA",
    organization: { type: "CLINIC", disabledModules: [], parent: { disabledModules: state.disabled } },
  }),
  verifyPatientAccess: async () => true,
}));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: () => { throw new Error("Accès base inattendu"); } }),
}));
vi.mock("@/middlewares/auditLogger", () => ({ logAuditAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Case = { module: ModuleKey; label: string; role?: string; call: () => Promise<{ success: boolean; error?: string }> };

const ID = "65f1a2b3c4d5e6f7a8b9c0d1";
const CASES: Case[] = [
  { module: "ACCUEIL", label: "listTodayVisits", call: async () => (await import("./visits")).listTodayVisits("clinicA") },
  { module: "URGENCES", label: "listEmergencyBoard", call: async () => (await import("./triage")).listEmergencyBoard("clinicA") },
  { module: "HOSPITALISATION", label: "listWardsWithRooms", call: async () => (await import("./wards")).listWardsWithRooms("clinicA") as never },
  { module: "HOSPITALISATION", label: "getRoundTeam", call: async () => (await import("./rounds")).getRoundTeam("clinicA") },
  { module: "LABORATOIRE", label: "listLabOrders", call: async () => (await import("./lab")).listLabOrders({ organizationId: "clinicA" }) as never },
  { module: "IMAGERIE", label: "listRadiologyOrders", call: async () => (await import("./radiology")).listRadiologyOrders({ clinicId: "clinicA" }) },
  { module: "BLOC", label: "listSurgeryDay", call: async () => (await import("./surgery")).listSurgeryDay("clinicA") },
  { module: "BANQUE_SANG", label: "listBloodStock", call: async () => (await import("./blood-bank")).listBloodStock("clinicA") },
  { module: "PHARMACIE", label: "getStockValuation", call: async () => (await import("./stock")).getStockValuation("clinicA") as never },
  { module: "PHARMACIE", label: "listPharmacyDispenseQueue", role: "PHARMACIST", call: async () => (await import("./finance")).listPharmacyDispenseQueue("clinicA") as never },
  { module: "PHARMACIE", label: "sendPrescriptionToPharmacy", role: "MEDECIN", call: async () => (await import("./prescriptions")).sendPrescriptionToPharmacy(ID) as never },
  { module: "MATERNITE", label: "listPregnancies", call: async () => (await import("./maternity")).listPregnancies(ID) as never },
  { module: "IA", label: "generateAIAnalysis", call: async () => (await import("./ai")).generateAIAnalysis(ID) as never },
  { module: "CONTRATS_AIDANTS", label: "listContracts", call: async () => (await import("./contracts")).listContracts("clinicA") as never },
  { module: "INTEROPERABILITE", label: "listIntegrationClients", call: async () => (await import("./integrations")).listIntegrationClients("clinicA") },
];

beforeEach(() => {
  state.disabled = [];
  state.role = "COORDINATOR";
});

describe("gardes des modules de la licence", () => {
  it.each(CASES)("$module refuse $label quand le module est désactivé", async ({ module, role, call }) => {
    state.disabled = [module];
    if (role) state.role = role;
    const res = await call();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/n'est pas inclus dans la licence/);
  });

  it("refuse une orientation d'accueil vers un service hors licence", async () => {
    state.disabled = ["LABORATOIRE"];
    const { registerVisit } = await import("./visits");
    const res = await registerVisit({ clinicId: "clinicA", patientId: ID, destination: "LAB" });
    expect(res.success ? "" : res.error).toMatch(/Laboratoire.*licence/);
  });

  it("refuse la vente de produits à la caisse sans le module Pharmacie", async () => {
    state.disabled = ["PHARMACIE"];
    state.role = "CASHIER";
    const { createCaisseSale } = await import("./finance");
    const res = await createCaisseSale({
      cashSessionId: ID,
      paymentMethod: "CASH",
      items: [{ type: "PHARMACY", pharmacyItemId: ID, description: "Paracétamol", quantity: 1, unitPrice: 500, amount: 500 }],
    } as never);
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toMatch(/Pharmacie.*licence/);
  });
});
