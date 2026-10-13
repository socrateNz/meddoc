"use client";

import { createContext, useContext } from "react";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";

// Modules de la licence de l'utilisateur, fournis une fois par le layout du tableau de bord
// (src/app/dashboard/layout.tsx) aux composants client : menu, dossier patient, consultation,
// accueil... Ne fait que masquer : le contrôle réel est dans les actions serveur.
const ModulesContext = createContext<readonly ModuleKey[]>(MODULE_KEYS);

export function ModulesProvider({ modules, children }: { modules: ModuleKey[]; children: React.ReactNode }) {
  return <ModulesContext.Provider value={modules}>{children}</ModulesContext.Provider>;
}

export function useModules(): readonly ModuleKey[] {
  return useContext(ModulesContext);
}

export function useHasModule(key: ModuleKey): boolean {
  return useContext(ModulesContext).includes(key);
}
