import { describe, it, expect } from "vitest";
import { quickActionsFor } from "./quick-actions";
import { MODULE_KEYS } from "@/lib/modules";

const all = [...MODULE_KEYS];
const labels = (role: string, modules: readonly string[] = all) => quickActionsFor(role, modules).map((a) => a.label);

describe("Mes actions du jour", () => {
  it("donne à chaque rôle ses tâches courantes, quatre au plus", () => {
    expect(labels("CASHIER")[0]).toBe("Encaisser un ticket");
    expect(labels("PHARMACIST").slice(0, 2)).toEqual(["Remettre des médicaments", "Encaisser un ticket"]);
    expect(labels("MEDECIN")[0]).toBe("Mes consultations");
    expect(labels("LABORANTIN")).toContain("Saisir des résultats");
    for (const role of ["COORDINATOR", "MEDECIN", "CAREGIVER", "CASHIER", "PHARMACIST"]) expect(labels(role).length).toBeLessThanOrEqual(4);
  });

  it("une page n'apparaît qu'une fois et les modules hors licence sont masqués", () => {
    const medecin = labels("MEDECIN");
    expect(medecin.filter((l) => l.includes("résultats")).length).toBeLessThanOrEqual(1);
    expect(labels("LABORANTIN", ["ACCUEIL", "PHARMACIE"])).not.toContain("Saisir des résultats");
  });

  it("suit les permissions ajustées par la clinique", () => {
    const actions = quickActionsFor({ role: "CASHIER", permissions: ["visits.register"] }, all).map((a) => a.label);
    expect(actions).toEqual(["Enregistrer une arrivée"]);
  });
});
