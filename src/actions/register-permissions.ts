import { can, rolesWith, type PermissionSubject } from "@/lib/permissions-catalog";

// Rôles autorisés à opérer une caisse (ouvrir/fermer une session, encaisser, enregistrer une
// dépense/vente). Extrait de src/actions/registers.ts vers un module sans directive "use server"
// car un fichier "use server" ne peut exporter que des fonctions async (ni fonctions
// synchrones, ni constantes) — cette règle empêchait src/actions/finance.ts d'importer
// assertRegisterOperateRole directement depuis registers.ts.
// Rôles qui ont « register.operate » par défaut (pour les écrans qui les listent). Pour un membre
// donné, ce sont ses permissions effectives qui comptent (rôle ajusté par la clinique, cf.
// src/lib/permissions-server.ts — qui reprend aussi l'ancien réglage « le pharmacien peut tenir la
// caisse »).
export const REGISTER_OPERATE_ROLES = [...rolesWith("register.operate")];

export function canOperateRegister(user: PermissionSubject): boolean {
  return can(user, "register.operate");
}

export function assertRegisterOperateRole(user: PermissionSubject) {
  if (!canOperateRegister(user)) throw new Error("Non autorisé. Votre rôle ne permet pas de tenir la caisse.");
}

// Consulter les caisses (et leur état) — ouvert à ADMIN (holding, lecture seule) en plus des
// rôles qui opèrent réellement la caisse. Partagé par registers.ts et finance.ts (ex: la liste
// des tickets impayés est visible par les mêmes rôles qui peuvent régler un paiement). Le
// pharmacien garde cette lecture même sans accès à la caisse : la pharmacie liste les caisses
// ouvertes pour régler un achat de stock en espèces.
export const REGISTER_READ_ROLES = [...rolesWith("register.read")];

export function assertRegisterReadRole(role: PermissionSubject) {
  if (!can(role, "register.read")) throw new Error("Non autorisé.");
}
