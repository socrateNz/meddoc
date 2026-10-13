import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULES, MODULE_KEYS, PLAN_MODULES, disabledModulesFor, enabledModulesFrom, moduleForPath, withRequirements } from "./modules";
import { modulesOfUser } from "./modules-server";

describe("registre des modules", () => {
  it("considère une liste vide comme « tous les modules » (holdings existantes)", () => {
    expect(enabledModulesFrom([])).toEqual([...MODULE_KEYS]);
    expect(enabledModulesFrom(undefined)).toEqual([...MODULE_KEYS]);
    expect(enabledModulesFrom(["INCONNU"])).toEqual([...MODULE_KEYS]);
  });

  it("désactive un module dont un prérequis est désactivé", () => {
    const on = enabledModulesFrom(["ACCUEIL"]);
    expect(on).not.toContain("ACCUEIL");
    expect(on).not.toContain("URGENCES");
    expect(on).toContain("LABORATOIRE");
  });

  it("ajoute les prérequis d'une sélection et calcule la liste stockée", () => {
    expect(withRequirements(["URGENCES"])).toEqual(["ACCUEIL", "URGENCES"]);
    const stored = disabledModulesFor(["URGENCES", "LABORATOIRE"]);
    expect(stored).not.toContain("ACCUEIL");
    expect(enabledModulesFrom(stored)).toEqual(["ACCUEIL", "URGENCES", "LABORATOIRE"]);
  });

  it("propose des plans cohérents avec les prérequis", () => {
    for (const modules of Object.values(PLAN_MODULES)) expect(withRequirements(modules)).toEqual(MODULE_KEYS.filter((k) => modules.includes(k)));
    expect(PLAN_MODULES.BASIC).toEqual(["ACCUEIL", "PHARMACIE"]);
    expect(PLAN_MODULES.ENTERPRISE).toEqual([...MODULE_KEYS]);
  });

  it("rattache chaque chemin du tableau de bord à son module", () => {
    expect(moduleForPath("/dashboard/clinics/abc/lab/123")).toBe("LABORATOIRE");
    expect(moduleForPath("/dashboard/pharmacie")).toBe("PHARMACIE");
    expect(moduleForPath("/dashboard/clinics/abc/ronde")).toBe("HOSPITALISATION");
    expect(moduleForPath("/dashboard/clinics/abc/patients")).toBeNull();
    expect(moduleForPath("/dashboard/clinics/abc/caisse")).toBeNull();
  });

  it("protège chaque page de module par un layout de garde", () => {
    const root = join(process.cwd(), "src/app/dashboard");
    for (const key of MODULE_KEYS) {
      for (const segment of MODULES[key].routeSegments) {
        const file = join(root, "clinics/[id]", segment, "layout.tsx");
        expect(existsSync(file), `${file} manquant`).toBe(true);
        expect(readFileSync(file, "utf8")).toContain(`isModulePageAllowed("${key}")`);
      }
    }
  });
});

describe("modulesOfUser", () => {
  it("fait hériter la clinique des modules de sa holding", () => {
    const user = { role: "MEDECIN", organization: { type: "CLINIC", disabledModules: [], parent: { disabledModules: ["BLOC", "IA"] } } };
    expect(modulesOfUser(user)).not.toContain("BLOC");
    expect(modulesOfUser(user)).toContain("LABORATOIRE");
  });

  it("lit les modules de la holding pour l'admin de holding, et tout pour le SUPER_ADMIN", () => {
    expect(modulesOfUser({ role: "ADMIN", organization: { type: "HOLDING", disabledModules: ["PHARMACIE"] } })).not.toContain("PHARMACIE");
    expect(modulesOfUser({ role: "SUPER_ADMIN", organization: null })).toEqual([...MODULE_KEYS]);
    expect(modulesOfUser({ role: "MEDECIN", organization: { type: "CLINIC", disabledModules: ["IA"], parent: null } })).not.toContain("IA");
    expect(modulesOfUser(null)).toEqual([]);
  });
});
