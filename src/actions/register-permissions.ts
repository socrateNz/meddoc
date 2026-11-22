// Rôles autorisés à opérer une caisse (ouvrir/fermer une session, encaisser, enregistrer une
// dépense/vente). Extrait de src/actions/registers.ts vers un module sans directive "use server"
// car un fichier "use server" ne peut exporter que des fonctions async (ni fonctions
// synchrones, ni constantes) — cette règle empêchait src/actions/finance.ts d'importer
// assertRegisterOperateRole directement depuis registers.ts.
// PHARMACIST : seulement si le coordinateur de sa clinique l'y autorise
// (Organization.pharmacistCanUseRegister, absent = oui) — cf. pharmacistMayUseRegister.
export const REGISTER_OPERATE_ROLES = ["COORDINATOR", "CASHIER", "PHARMACIST"];

type RegisterUser = { role: string; organization?: { pharmacistCanUseRegister?: boolean | null } | null };

// Réglage de la clinique du pharmacien (getCurrentUser le charge avec l'établissement).
export function pharmacistMayUseRegister(user: RegisterUser): boolean {
  return user.organization?.pharmacistCanUseRegister !== false;
}

export function canOperateRegister(user: RegisterUser): boolean {
  if (!REGISTER_OPERATE_ROLES.includes(user.role)) return false;
  return user.role !== "PHARMACIST" || pharmacistMayUseRegister(user);
}

export function assertRegisterOperateRole(user: RegisterUser) {
  if (!REGISTER_OPERATE_ROLES.includes(user.role)) throw new Error("Non autorisé. Réservé aux caissiers, coordinateurs et pharmacien(ne)s.");
  if (!canOperateRegister(user)) {
    throw new Error("Non autorisé. Le coordinateur n'a pas autorisé les pharmaciens à tenir la caisse dans cette clinique.");
  }
}

// Consulter les caisses (et leur état) — ouvert à ADMIN (holding, lecture seule) en plus des
// rôles qui opèrent réellement la caisse. Partagé par registers.ts et finance.ts (ex: la liste
// des tickets impayés est visible par les mêmes rôles qui peuvent régler un paiement). Le
// pharmacien garde cette lecture même sans accès à la caisse : la pharmacie liste les caisses
// ouvertes pour régler un achat de stock en espèces.
export const REGISTER_READ_ROLES = ["ADMIN", "COORDINATOR", "CASHIER", "PHARMACIST", "COMPTABLE"];

export function assertRegisterReadRole(role: string) {
  if (!REGISTER_READ_ROLES.includes(role)) throw new Error("Non autorisé.");
}
