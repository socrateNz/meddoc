import { describe, it, expect } from "vitest";
import { canAccessSection, isClinicStaffRole } from "./staff-roles";
import { assertRegisterOperateRole, canOperateRegister } from "@/actions/register-permissions";

describe("accès par section", () => {
  it("l'accueil gère la file et les rendez-vous, sans dossier médical ni laboratoire ni caisse", () => {
    expect(canAccessSection("ACCUEIL", "accueil")).toBe(true);
    expect(canAccessSection("ACCUEIL", "appointments")).toBe(true);
    for (const s of ["patients", "lab", "caisse", "pharmacie", "finance", "maternite"]) expect(canAccessSection("ACCUEIL", s)).toBe(false);
  });

  it("le laborantin travaille au laboratoire sans accès aux dossiers ni aux finances", () => {
    expect(canAccessSection("LABORANTIN", "lab")).toBe(true);
    for (const s of ["patients", "caisse", "finance", "imagerie"]) expect(canAccessSection("LABORANTIN", s)).toBe(false);
  });

  it("le pharmacien n'ouvre plus les dossiers patients", () => {
    expect(canAccessSection("PHARMACIST", "patients")).toBe(false);
    expect(canAccessSection("PHARMACIST", "pharmacie")).toBe(true);
  });

  it("le comptable reste limité à la finance et à la comptabilité", () => {
    expect(canAccessSection("COMPTABLE", "comptabilite")).toBe(true);
    for (const s of ["patients", "accueil", "lab", "caisse"]) expect(canAccessSection("COMPTABLE", s)).toBe(false);
  });

  it("le personnel recrutable par un coordinateur exclut coordinateur et admin", () => {
    expect(isClinicStaffRole("ACCUEIL")).toBe(true);
    expect(isClinicStaffRole("COORDINATOR")).toBe(false);
    expect(isClinicStaffRole("ADMIN")).toBe(false);
  });
});

describe("caisse du pharmacien", () => {
  const pharmacist = (pharmacistCanUseRegister?: boolean | null) => ({ role: "PHARMACIST", organization: { pharmacistCanUseRegister } });

  it("autorisée par défaut (clinique existante, réglage absent)", () => {
    expect(canOperateRegister(pharmacist(null))).toBe(true);
    expect(canOperateRegister(pharmacist(undefined))).toBe(true);
  });

  it("refusée quand le coordinateur l'a désactivée, sans toucher au caissier", () => {
    expect(canOperateRegister(pharmacist(false))).toBe(false);
    expect(() => assertRegisterOperateRole(pharmacist(false))).toThrow(/coordinateur n'a pas autorisé/);
    expect(canOperateRegister({ role: "CASHIER", organization: { pharmacistCanUseRegister: false } })).toBe(true);
  });

  it("jamais pour un rôle hors caisse", () => {
    expect(canOperateRegister({ role: "ACCUEIL" })).toBe(false);
  });
});
