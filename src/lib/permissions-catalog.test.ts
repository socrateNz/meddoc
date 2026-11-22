import { describe, it, expect } from "vitest";
import { PERMISSIONS, PERMISSION_KEYS, SECTION_PERMISSIONS, can, canAccessSection, permissionsOf, rolesWith, type Permission } from "./permissions-catalog";

// Passage des rôles codés en dur aux permissions (étape 2) : AUCUN changement de droits. Ces
// listes figent ce que chaque contrôle acceptait avant la migration ; les permissions par défaut
// doivent donner exactement les mêmes rôles.
const ALL_ROLES = ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE", "FAMILY", "PATIENT"];

const LEGACY_SECTIONS: Record<string, string[]> = {
  patients: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  accueil: ["ADMIN", "COORDINATOR", "ACCUEIL", "MEDECIN", "CAREGIVER", "LABORANTIN", "CASHIER", "PHARMACIST"],
  team: ["ADMIN", "COORDINATOR"],
  incidents: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER"],
  lab: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN"],
  imagerie: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  maternite: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  urgences: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  bloc: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "banque-sang": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  rooms: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  ronde: ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  appointments: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "ACCUEIL", "LABORANTIN", "PHARMACIST", "CASHIER"],
  "ai-assistant": ["ADMIN", "COORDINATOR", "MEDECIN"],
  medecin: ["MEDECIN"],
  caisse: ["ADMIN", "COORDINATOR", "CASHIER", "PHARMACIST"],
  pharmacie: ["ADMIN", "COORDINATOR", "PHARMACIST"],
  finance: ["ADMIN", "COORDINATOR", "COMPTABLE"],
  comptabilite: ["ADMIN", "COORDINATOR", "COMPTABLE"],
  partenaires: ["ADMIN", "COORDINATOR", "COMPTABLE"],
  contracts: ["ADMIN", "COORDINATOR"],
  permissions: ["ADMIN"],
  "audit-log": ["ADMIN"],
  "contact-messages": ["SUPER_ADMIN"],
  holdings: ["SUPER_ADMIN"],
  messages: ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"],
  manual: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE", "FAMILY", "PATIENT"],
  notifications: ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"],
};

// Listes de rôles des actions serveur avant la migration → permission qui les remplace.
const LEGACY_ACTIONS: Partial<Record<Permission, string[]>> = {
  "lab.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN"],
  "lab.order": ["COORDINATOR", "MEDECIN"],
  "lab.operate": ["COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN"],
  "lab.validate": ["COORDINATOR", "MEDECIN"],
  "lab.ai": ["COORDINATOR", "MEDECIN"],
  "visits.read": ["ADMIN", "COORDINATOR", "ACCUEIL", "MEDECIN", "CAREGIVER", "LABORANTIN", "CASHIER", "PHARMACIST"],
  "visits.register": ["COORDINATOR", "ACCUEIL", "MEDECIN", "CAREGIVER", "CASHIER"],
  "appointments.schedule": ["COORDINATOR", "MEDECIN", "CAREGIVER", "ACCUEIL"],
  "consultation.write": ["COORDINATOR", "MEDECIN"],
  "records.write": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "records.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "patients.list": ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "ACCUEIL", "CASHIER"],
  "prescriptions.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "PHARMACIST"],
  "prescriptions.write": ["COORDINATOR", "MEDECIN"],
  "maternity.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "maternity.write": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "imaging.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "imaging.order": ["COORDINATOR", "MEDECIN"],
  "imaging.perform": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "imaging.report": ["COORDINATOR", "MEDECIN"],
  "surgery.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "surgery.schedule": ["COORDINATOR", "MEDECIN"],
  "surgery.checklist": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "bloodbank.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "bloodbank.stock": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "bloodbank.reserve": ["COORDINATOR", "MEDECIN"],
  "bloodbank.administer": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "rooms.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "rooms.operate": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "triage.read": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "triage.write": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "stock.read": ["ADMIN", "COORDINATOR", "PHARMACIST", "COMPTABLE"],
  "stock.write": ["COORDINATOR", "PHARMACIST"],
  "pharmacy.catalog.read": ["ADMIN", "COORDINATOR", "PHARMACIST", "CASHIER"],
  "pharmacy.dispense": ["PHARMACIST"],
  "register.read": ["ADMIN", "COORDINATOR", "CASHIER", "PHARMACIST", "COMPTABLE"],
  "register.operate": ["COORDINATOR", "CASHIER", "PHARMACIST"],
  "invoices.manage": ["COORDINATOR", "ADMIN", "SUPER_ADMIN"],
  "finance.read": ["ADMIN", "COORDINATOR", "COMPTABLE"],
  "accounting.read": ["COMPTABLE", "COORDINATOR", "ADMIN", "SUPER_ADMIN"],
  "accounting.write": ["COMPTABLE", "COORDINATOR"],
  "calendar.access": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "ACCUEIL", "LABORANTIN", "PHARMACIST", "CASHIER"],
  "calendar.caretasks": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "appointments.read_all": ["ADMIN", "COORDINATOR", "ACCUEIL", "SUPER_ADMIN"],
  "partners.pick": ["ADMIN", "COORDINATOR", "MEDECIN", "LABORANTIN", "CAREGIVER", "COMPTABLE"],
  "partners.statements": ["ADMIN", "COORDINATOR", "COMPTABLE"],
  "partners.settle": ["COORDINATOR", "COMPTABLE"],
  "incidents.access": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER", "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER"],
  "ai.analyze": ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"],
  "ai.use": ["ADMIN", "COORDINATOR", "MEDECIN"],
  "rounds.run": ["COORDINATOR", "MEDECIN", "CAREGIVER"],
  "contracts.read": ["ADMIN", "COORDINATOR"],
  "integrations.read": ["ADMIN", "COORDINATOR"],
  "pharmacy.dispense.cancel": ["COORDINATOR"],
  "stock.supervise": ["COORDINATOR"],
};

const sorted = (a: readonly string[]) => [...a].sort();

describe("catalogue des permissions — mêmes droits qu'avant la migration", () => {
  it("donne exactement les mêmes accès aux pages pour chaque rôle", () => {
    expect(Object.keys(SECTION_PERMISSIONS).sort()).toEqual(Object.keys(LEGACY_SECTIONS).sort());
    for (const [section, roles] of Object.entries(LEGACY_SECTIONS)) {
      for (const role of ALL_ROLES) {
        expect(canAccessSection(role, section), `${role} → ${section}`).toBe(roles.includes(role));
      }
    }
  });

  it("reprend exactement les rôles de chaque ancien contrôle des actions", () => {
    for (const [permission, roles] of Object.entries(LEGACY_ACTIONS)) {
      expect(sorted(rolesWith(permission as Permission)), permission).toEqual(sorted(roles));
    }
  });

  it("n'a que des rôles connus et un libellé pour chaque permission", () => {
    for (const key of PERMISSION_KEYS) {
      expect(PERMISSIONS[key].label.length).toBeGreaterThan(3);
      for (const role of PERMISSIONS[key].roles) expect(ALL_ROLES).toContain(role);
    }
  });
});

describe("can", () => {
  it("se déduit du rôle, ou des permissions propres de l'utilisateur quand elles existent", () => {
    expect(can("LABORANTIN", "lab.operate")).toBe(true);
    expect(can({ role: "LABORANTIN" }, "lab.validate")).toBe(false);
    // Rôle ajusté par la clinique (étape 3) : ses permissions remplacent celles du rôle.
    expect(can({ role: "LABORANTIN", permissions: ["lab.operate", "lab.validate"] }, "lab.validate")).toBe(true);
    expect(can({ role: "COORDINATOR", permissions: [] }, "lab.read")).toBe(false);
    expect(permissionsOf(null).size).toBe(0);
    expect(can("INCONNU", "lab.read")).toBe(false);
  });
});
