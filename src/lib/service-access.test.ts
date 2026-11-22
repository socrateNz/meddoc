import { describe, it, expect, vi, beforeEach } from "vitest";

// Cloisonnement des dossiers par service : règle pure + application dans verifyPatientAccess, par
// où passent toutes les actions sur un patient.
const db = vi.hoisted(() => ({
  transversal: 0,
  patient: null as null | { id: string; serviceId: string | null },
  findMany: vi.fn(async () => [{ id: "p-ophtalmo" }]),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    clinicService: { count: vi.fn(async () => db.transversal) },
    patient: { findFirst: vi.fn(async () => db.patient), findMany: db.findMany },
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { canSeePatientService, hiddenPatientIds, patientServiceWhere, restrictedServiceIds } from "./service-access";

process.env.JWT_SECRET ??= "test";
process.env.JWT_REFRESH_SECRET ??= "test";

beforeEach(() => {
  db.transversal = 0;
  db.patient = null;
});

const clinic = { organizationId: "c1", organization: { type: "CLINIC" } };

describe("restrictedServiceIds", () => {
  it("ne restreint ni la direction, ni le personnel sans service, ni les rôles non soignants", async () => {
    expect(await restrictedServiceIds({ role: "COORDINATOR", serviceIds: ["s1"] })).toBeNull();
    expect(await restrictedServiceIds({ role: "MEDECIN", serviceIds: [] })).toBeNull();
    expect(await restrictedServiceIds({ role: "LABORANTIN", serviceIds: ["s1"] })).toBeNull();
  });

  it("restreint un médecin ou un infirmier à ses services", async () => {
    expect(await restrictedServiceIds({ role: "CAREGIVER", serviceIds: ["s1", "s2"] })).toEqual(["s1", "s2"]);
  });

  it("ne restreint pas le personnel d'un service transversal (labo, imagerie, urgences)", async () => {
    db.transversal = 1;
    expect(await restrictedServiceIds({ role: "MEDECIN", serviceIds: ["labo"] })).toBeNull();
  });
});

describe("règle de visibilité", () => {
  it("laisse voir les dossiers sans service et ceux de ses services seulement", () => {
    expect(canSeePatientService(["s1"], null)).toBe(true);
    expect(canSeePatientService(["s1"], "s1")).toBe(true);
    expect(canSeePatientService(["s1"], "s2")).toBe(false);
    expect(canSeePatientService(null, "s2")).toBe(true);
  });

  it("filtre en base les dossiers sans service (champ absent ou nul) et ceux de ses services", () => {
    expect(patientServiceWhere(null)).toEqual({});
    expect(patientServiceWhere(["s1"])).toEqual({ OR: [{ serviceId: { isSet: false } }, { serviceId: null }, { serviceId: { in: ["s1"] } }] });
  });
});

describe("hiddenPatientIds", () => {
  it("ne cherche rien pour un utilisateur non restreint", async () => {
    expect(await hiddenPatientIds("c1", null)).toEqual([]);
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("liste les patients suivis par un autre service (ni sans service, ni des siens)", async () => {
    expect(await hiddenPatientIds("c1", ["maternite"])).toEqual(["p-ophtalmo"]);
    expect(db.findMany).toHaveBeenCalledWith({
      where: { organizationId: "c1", AND: [{ serviceId: { not: null } }, { serviceId: { notIn: ["maternite"] } }] },
      select: { id: true },
    });
  });
});

describe("verifyPatientAccess", () => {
  it("refuse à l'infirmière de maternité le dossier suivi en ophtalmologie", async () => {
    const { verifyPatientAccess } = await import("./auth");
    db.patient = { id: "p1", serviceId: "ophtalmo" };
    expect(await verifyPatientAccess("p1", { role: "CAREGIVER", serviceIds: ["maternite"], ...clinic })).toBe(false);
    expect(await verifyPatientAccess("p1", { role: "CAREGIVER", serviceIds: ["ophtalmo"], ...clinic })).toBe(true);
    expect(await verifyPatientAccess("p1", { role: "COORDINATOR", serviceIds: [], ...clinic })).toBe(true);
  });
});
