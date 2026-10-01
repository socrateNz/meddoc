import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPatientActivityTimeline, calculatePatientAge, findNextAppointment } from "./patient-detail-data";

describe("calculatePatientAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calcule l'âge révolu, en tenant compte du mois/jour pas encore atteint cette année", () => {
    expect(calculatePatientAge("2000-06-15")).toBe(26); // anniversaire le jour même
    expect(calculatePatientAge("2000-06-16")).toBe(25); // anniversaire pas encore atteint
    expect(calculatePatientAge("2000-01-01")).toBe(26); // anniversaire déjà passé cette année
  });
});

describe("findNextAppointment", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("retourne le plus proche dans le futur parmi les rendez-vous encore planifiés", () => {
    const appointments = [
      { id: "a", status: "SCHEDULED", scheduledAt: "2026-06-20T09:00:00Z" },
      { id: "b", status: "SCHEDULED", scheduledAt: "2026-06-17T09:00:00Z" }, // le plus proche
      { id: "c", status: "SCHEDULED", scheduledAt: "2026-06-25T09:00:00Z" },
    ];
    expect(findNextAppointment(appointments, now)?.id).toBe("b");
  });

  it("ignore les rendez-vous passés, annulés ou terminés", () => {
    const appointments = [
      { id: "past", status: "SCHEDULED", scheduledAt: "2026-06-01T09:00:00Z" },
      { id: "cancelled", status: "CANCELLED", scheduledAt: "2026-06-20T09:00:00Z" },
      { id: "completed", status: "COMPLETED", scheduledAt: "2026-06-10T09:00:00Z" },
    ];
    expect(findNextAppointment(appointments, now)).toBeNull();
  });

  it("retourne null si aucun rendez-vous", () => {
    expect(findNextAppointment([], now)).toBeNull();
  });
});

describe("buildPatientActivityTimeline", () => {
  it("fusionne les 5 catégories en un seul fil trié du plus récent au plus ancien", () => {
    const timeline = buildPatientActivityTimeline({
      medicalRecords: [{ id: "r1", title: "Compte-rendu visite", createdAt: "2026-06-10T10:00:00Z" }],
      prescriptions: [{ id: "p1", createdAt: "2026-06-12T10:00:00Z", prescribedBy: { firstName: "Awa", lastName: "Ndiaye" } }],
      labOrders: [{ id: "l1", tests: ["NFS", "Glycémie"], createdAt: "2026-06-08T10:00:00Z" }],
      appointments: [{ id: "a1", title: "Suivi mensuel", status: "COMPLETED", scheduledAt: "2026-06-14T10:00:00Z" }],
      incidents: [{ id: "i1", title: "Chute", priority: "HIGH", createdAt: "2026-06-05T10:00:00Z" }],
    });

    expect(timeline.map((e) => e.key)).toEqual([
      "appointment-a1", // 14/06
      "prescription-p1", // 12/06
      "record-r1", // 10/06
      "lab-l1", // 08/06
      "incident-i1", // 05/06
    ]);
    expect(timeline[1]).toMatchObject({ category: "prescription", meta: "Par Awa Ndiaye" });
    expect(timeline[3]).toMatchObject({ category: "lab", title: "NFS, Glycémie" });
  });

  it("donne un lien réel vers la consultation quand le dossier/l'ordonnance en a une, sinon un repli vers l'onglet", () => {
    const timeline = buildPatientActivityTimeline({
      medicalRecords: [
        { id: "r1", title: "Avec RDV", createdAt: new Date(2026, 0, 2), appointment: { id: "apt1" } },
        { id: "r2", title: "Sans RDV", createdAt: new Date(2026, 0, 1) },
      ],
      prescriptions: [],
      labOrders: [{ id: "l1", tests: ["NFS"], createdAt: new Date(2026, 0, 3) }],
      appointments: [{ id: "apt2", title: "Visite", status: "SCHEDULED", scheduledAt: new Date(2026, 0, 4) }],
      incidents: [{ id: "i1", title: "Chute", priority: "LOW", createdAt: new Date(2026, 0, 1) }],
    });

    const byKey = Object.fromEntries(timeline.map((e) => [e.key, e]));
    expect(byKey["record-r1"].href).toBe("/dashboard/appointments/apt1/consultation");
    expect(byKey["record-r2"].href).toBeUndefined();
    expect(byKey["record-r2"].tab).toBe("records");
    expect(byKey["lab-l1"].href).toBe("/dashboard/lab/l1");
    expect(byKey["appointment-apt2"].href).toBe("/dashboard/appointments/apt2/consultation");
    expect(byKey["incident-i1"].href).toBeUndefined();
    expect(byKey["incident-i1"].tab).toBe("incidents");
  });

  it("ne garde que les N plus récentes (limite par défaut : 8)", () => {
    const medicalRecords = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      title: `Doc ${i}`,
      createdAt: new Date(2026, 0, i + 1),
    }));
    const timeline = buildPatientActivityTimeline({
      medicalRecords,
      prescriptions: [],
      labOrders: [],
      appointments: [],
      incidents: [],
    });

    expect(timeline).toHaveLength(8);
    // Les 8 plus récentes = les id les plus élevés (dates les plus tardives).
    expect(timeline[0].key).toBe("record-r11");
    expect(timeline[7].key).toBe("record-r4");
  });

  it("respecte une limite explicite", () => {
    const timeline = buildPatientActivityTimeline({
      medicalRecords: [{ id: "r1", title: "A", createdAt: new Date() }],
      prescriptions: [],
      labOrders: [],
      appointments: [],
      incidents: [],
      limit: 1,
    });
    expect(timeline).toHaveLength(1);
  });

  it("gère une demande d'analyse sans libellé de test (tableau vide)", () => {
    const timeline = buildPatientActivityTimeline({
      medicalRecords: [],
      prescriptions: [],
      labOrders: [{ id: "l1", tests: [], createdAt: new Date() }],
      appointments: [],
      incidents: [],
    });
    expect(timeline[0].title).toBe("Demande d'analyse");
  });
});

describe("fetchPatientRelatedData", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("court-circuite ordonnances/labo/grossesses/soignants pour un pharmacien (accès identité uniquement)", async () => {
    vi.doMock("@/actions/vitals", () => ({ getPatientVitalSigns: vi.fn(async () => ({ success: true, data: [{ id: "v1" }] })) }));
    const listPrescriptions = vi.fn();
    const listLabOrders = vi.fn();
    const listPregnancies = vi.fn();
    vi.doMock("@/actions/prescriptions", () => ({ listPrescriptions }));
    vi.doMock("@/actions/lab", () => ({ listLabOrders }));
    vi.doMock("@/actions/maternity", () => ({ listPregnancies }));
    vi.doMock("@/lib/db", () => ({ prisma: { caregiver: { findMany: vi.fn() } } }));
    const { fetchPatientRelatedData } = await import("./patient-detail-data");

    const result = await fetchPatientRelatedData("patient1", { isPharmacist: true, organizationIdForCaregivers: "org1" });

    expect(result).toEqual({ vitalSigns: [{ id: "v1" }], prescriptions: [], labOrders: [], pregnancies: [], caregivers: [] });
    expect(listPrescriptions).not.toHaveBeenCalled();
    expect(listLabOrders).not.toHaveBeenCalled();
    expect(listPregnancies).not.toHaveBeenCalled();
  });

  it("filtre les soignants par l'établissement fourni, sans requête si absent", async () => {
    vi.doMock("@/actions/vitals", () => ({ getPatientVitalSigns: vi.fn(async () => ({ success: true, data: [] })) }));
    vi.doMock("@/actions/prescriptions", () => ({ listPrescriptions: vi.fn(async () => ({ success: true, data: [] })) }));
    vi.doMock("@/actions/lab", () => ({ listLabOrders: vi.fn(async () => ({ success: true, data: [] })) }));
    vi.doMock("@/actions/maternity", () => ({ listPregnancies: vi.fn(async () => ({ success: true, data: [] })) }));
    const findMany = vi.fn(async () => [{ id: "c1" }]);
    vi.doMock("@/lib/db", () => ({ prisma: { caregiver: { findMany } } }));
    const { fetchPatientRelatedData } = await import("./patient-detail-data");

    const withOrg = await fetchPatientRelatedData("patient1", { isPharmacist: false, organizationIdForCaregivers: "org1" });
    expect(withOrg.caregivers).toEqual([{ id: "c1" }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { user: { organizationId: "org1" } } }));

    const withoutOrg = await fetchPatientRelatedData("patient1", { isPharmacist: false, organizationIdForCaregivers: null });
    expect(withoutOrg.caregivers).toEqual([]);
  });

  it("retombe sur un tableau vide si une lecture individuelle échoue, sans faire échouer les autres", async () => {
    vi.doMock("@/actions/vitals", () => ({ getPatientVitalSigns: vi.fn(async () => { throw new Error("boom"); }) }));
    vi.doMock("@/actions/prescriptions", () => ({ listPrescriptions: vi.fn(async () => ({ success: true, data: [{ id: "p1" }] })) }));
    vi.doMock("@/actions/lab", () => ({ listLabOrders: vi.fn(async () => ({ success: false })) }));
    vi.doMock("@/actions/maternity", () => ({ listPregnancies: vi.fn(async () => ({ success: true, data: [] })) }));
    vi.doMock("@/lib/db", () => ({ prisma: { caregiver: { findMany: vi.fn(async () => []) } } }));
    const { fetchPatientRelatedData } = await import("./patient-detail-data");

    const result = await fetchPatientRelatedData("patient1", { isPharmacist: false, organizationIdForCaregivers: "org1" });

    expect(result.vitalSigns).toEqual([]);
    expect(result.prescriptions).toEqual([{ id: "p1" }]);
    expect(result.labOrders).toEqual([]);
  });
});
