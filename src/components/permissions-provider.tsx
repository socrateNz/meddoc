"use client";

import { createContext, useContext, useMemo } from "react";
import type { Permission } from "@/lib/permissions-catalog";

// Permissions effectives de l'utilisateur (cf. src/lib/permissions-server.ts), fournies une fois
// par le layout du tableau de bord aux composants client : afficher ou non un bouton, un onglet...
// Ne fait que masquer : le contrôle réel est dans les actions serveur.
const PermissionsContext = createContext<ReadonlySet<string>>(new Set());

export function PermissionsProvider({ permissions, children }: { permissions: readonly string[]; children: React.ReactNode }) {
  const value = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): ReadonlySet<string> {
  return useContext(PermissionsContext);
}

export function useCan(permission: Permission): boolean {
  return useContext(PermissionsContext).has(permission);
}
