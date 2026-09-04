// Rôles autorisés à opérer une caisse (ouvrir/fermer une session, encaisser, enregistrer une
// dépense/vente). Extrait de src/actions/registers.ts vers un module sans directive "use server"
// car un fichier "use server" ne peut exporter que des fonctions async (ni fonctions
// synchrones, ni constantes) — cette règle empêchait src/actions/finance.ts d'importer
// assertRegisterOperateRole directement depuis registers.ts.
// PHARMACIST inclus temporairement ("pour le moment") : le pharmacien peut se comporter comme un
// caissier (ouvrir/fermer une caisse, encaisser) le temps qu'un caissier dédié soit en place —
// à retirer de cette liste quand la séparation caisse/pharmacie doit redevenir stricte.
export const REGISTER_OPERATE_ROLES = ["COORDINATOR", "CASHIER", "PHARMACIST"];

export function assertRegisterOperateRole(role: string) {
  if (!REGISTER_OPERATE_ROLES.includes(role)) throw new Error("Non autorisé. Réservé aux caissiers, coordinateurs et pharmacien(ne)s.");
}
