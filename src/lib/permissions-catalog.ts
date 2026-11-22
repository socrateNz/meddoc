// Catalogue des permissions de MedDoc — source unique des droits, pure (sans accès base) : utilisée
// par le middleware (Edge), le menu, les actions serveur et les API.
//
// Chaque permission porte la liste des rôles qui l'ont PAR DÉFAUT. Un contrôle d'accès ne teste
// jamais un rôle, mais une permission : `can(user, "lab.validate")`. Chaque clinique peut ajuster
// ses rôles et en créer d'autres (modèle ClinicRole) ; les permissions EFFECTIVES d'un membre sont
// calculées par src/lib/permissions-server.ts et portées par getCurrentUser().permissions (et,
// encodées, par le jeton de session pour le middleware).
//
// AJOUTER une permission : toujours en fin de catalogue (cf. encodePermissions).
//
// Restent volontairement hors catalogue les contrôles d'IDENTITÉ et de structure, qui ne sont pas
// des droits délégables : super-admin de la plateforme, admin de holding, hiérarchie de l'équipe
// (qui peut recruter qui), et le cloisonnement par service (src/lib/service-access.ts).

type PermissionDef = { label: string; group: string; roles: readonly string[] };

const ADMIN_READ = ["ADMIN"] as const;
const CLINICAL = ["COORDINATOR", "MEDECIN", "CAREGIVER"] as const;
const DOCTORS = ["COORDINATOR", "MEDECIN"] as const;

export const PERMISSIONS = {
  // --- Patients et dossier ---
  "patients.list": { group: "Patients", label: "Rechercher un patient (identité)", roles: ["SUPER_ADMIN", ...ADMIN_READ, ...CLINICAL, "ACCUEIL", "CASHIER"] },
  "patients.create": { group: "Patients", label: "Enregistrer un nouveau patient", roles: [...CLINICAL, "ACCUEIL"] },
  "patients.import": { group: "Patients", label: "Importer des patients (CSV)", roles: ["COORDINATOR", "ACCUEIL"] },
  "records.read": { group: "Patients", label: "Lire le dossier médical", roles: [...ADMIN_READ, ...CLINICAL] },
  "records.write": { group: "Patients", label: "Compléter le dossier médical (notes, constantes, soins, documents)", roles: [...CLINICAL] },
  "records.transfer": { group: "Patients", label: "Transférer un dossier vers un autre service", roles: [...CLINICAL] },
  "records.files.manage_all": { group: "Patients", label: "Supprimer les documents déposés par d'autres", roles: ["COORDINATOR"] },
  "careplans.force": { group: "Patients", label: "Forcer la clôture d'une prise en charge", roles: ["COORDINATOR"] },
  "consultation.write": { group: "Patients", label: "Mener et clôturer une consultation", roles: [...DOCTORS] },
  "prescriptions.read": { group: "Patients", label: "Voir les ordonnances", roles: [...ADMIN_READ, ...CLINICAL, "PHARMACIST"] },
  "prescriptions.write": { group: "Patients", label: "Rédiger une ordonnance", roles: [...DOCTORS] },
  "patients.sync_offline": { group: "Patients", label: "Copie hors-ligne des dossiers", roles: [...CLINICAL] },

  // --- Accueil, rendez-vous, calendrier ---
  "visits.read": { group: "Accueil", label: "Voir la file d'attente", roles: [...ADMIN_READ, "COORDINATOR", "ACCUEIL", "MEDECIN", "CAREGIVER", "LABORANTIN", "CASHIER", "PHARMACIST"] },
  "visits.register": { group: "Accueil", label: "Enregistrer une arrivée (ticket)", roles: ["COORDINATOR", "ACCUEIL", "MEDECIN", "CAREGIVER", "CASHIER"] },
  "visits.handle.all": { group: "Accueil", label: "Prendre en charge tout passage", roles: [...CLINICAL] },
  "visits.handle.admin": { group: "Accueil", label: "Prendre en charge les passages « administratif / caisse »", roles: ["CASHIER"] },
  "visits.handle.pharmacy": { group: "Accueil", label: "Prendre en charge les passages « pharmacie »", roles: ["PHARMACIST"] },
  "visits.handle.lab": { group: "Accueil", label: "Prendre en charge les passages « laboratoire »", roles: ["LABORANTIN"] },
  "appointments.schedule": { group: "Accueil", label: "Prendre et déplacer des rendez-vous", roles: [...CLINICAL, "ACCUEIL"] },
  "appointments.read_all": { group: "Accueil", label: "Voir les rendez-vous de toute la clinique", roles: ["SUPER_ADMIN", ...ADMIN_READ, "COORDINATOR", "ACCUEIL"] },
  "calendar.access": { group: "Accueil", label: "Ouvrir le calendrier", roles: [...ADMIN_READ, ...CLINICAL, "ACCUEIL", "LABORANTIN", "PHARMACIST", "CASHIER"] },
  "calendar.caretasks": { group: "Accueil", label: "Voir les rendez-vous et tâches de soins au calendrier", roles: [...ADMIN_READ, ...CLINICAL] },
  "shifts.read_all": { group: "Accueil", label: "Voir les gardes de toute l'équipe", roles: [...ADMIN_READ, "COORDINATOR"] },
  "shifts.manage": { group: "Accueil", label: "Planifier les gardes", roles: ["COORDINATOR"] },

  // --- Urgences, hospitalisation, bloc, banque de sang ---
  "triage.read": { group: "Urgences", label: "Voir le tableau des urgences", roles: [...ADMIN_READ, ...CLINICAL] },
  "triage.write": { group: "Urgences", label: "Trier un patient (CIMU)", roles: [...CLINICAL] },
  "rooms.read": { group: "Hospitalisation", label: "Voir les chambres, lits et séjours", roles: [...ADMIN_READ, ...CLINICAL] },
  "rooms.operate": { group: "Hospitalisation", label: "Admettre, déplacer, faire sortir", roles: [...CLINICAL] },
  "rooms.structure": { group: "Hospitalisation", label: "Créer services, chambres et lits", roles: ["COORDINATOR"] },
  "stays.correct": { group: "Hospitalisation", label: "Corriger un séjour", roles: ["COORDINATOR"] },
  "rounds.run": { group: "Hospitalisation", label: "Faire la ronde médicale", roles: [...CLINICAL] },
  "surgery.read": { group: "Bloc", label: "Voir le programme opératoire", roles: [...ADMIN_READ, ...CLINICAL] },
  "surgery.schedule": { group: "Bloc", label: "Programmer une intervention, rédiger le compte rendu", roles: [...DOCTORS] },
  "surgery.checklist": { group: "Bloc", label: "Remplir la check-list de sécurité", roles: [...CLINICAL] },
  "surgery.rooms": { group: "Bloc", label: "Gérer les salles d'opération", roles: ["COORDINATOR"] },
  "surgery.manage_all": { group: "Bloc", label: "Agir sur les interventions des autres chirurgiens", roles: ["COORDINATOR"] },
  "bloodbank.read": { group: "Banque de sang", label: "Voir le stock de sang et les transfusions", roles: [...ADMIN_READ, ...CLINICAL] },
  "bloodbank.stock": { group: "Banque de sang", label: "Réceptionner et gérer les poches", roles: [...CLINICAL] },
  "bloodbank.reserve": { group: "Banque de sang", label: "Réserver une poche pour un patient", roles: [...DOCTORS] },
  "bloodbank.administer": { group: "Banque de sang", label: "Poser et suivre une transfusion", roles: [...CLINICAL] },

  // --- Laboratoire, imagerie, maternité ---
  "lab.read": { group: "Laboratoire", label: "Voir les demandes et résultats", roles: [...ADMIN_READ, ...CLINICAL, "LABORANTIN"] },
  "lab.order": { group: "Laboratoire", label: "Prescrire des examens", roles: [...DOCTORS] },
  "lab.order.prenatal": { group: "Laboratoire", label: "Demander le bilan d'une consultation prénatale", roles: ["CAREGIVER"] },
  "lab.order.partner": { group: "Laboratoire", label: "Enregistrer la demande d'un partenaire", roles: ["LABORANTIN"] },
  "lab.operate": { group: "Laboratoire", label: "Prélever, réceptionner, saisir les résultats", roles: [...CLINICAL, "LABORANTIN"] },
  "lab.validate": { group: "Laboratoire", label: "Valider les résultats", roles: [...DOCTORS] },
  "lab.ai": { group: "Laboratoire", label: "Analyse IA des résultats", roles: [...DOCTORS] },
  "lab.catalog": { group: "Laboratoire", label: "Gérer le catalogue d'examens", roles: ["COORDINATOR"] },
  "lab.sync_offline": { group: "Laboratoire", label: "Copie hors-ligne du catalogue", roles: [...ADMIN_READ, ...CLINICAL] },
  "imaging.read": { group: "Imagerie", label: "Voir les examens d'imagerie", roles: [...ADMIN_READ, ...CLINICAL] },
  "imaging.order": { group: "Imagerie", label: "Prescrire un examen d'imagerie", roles: [...DOCTORS] },
  "imaging.order.prenatal": { group: "Imagerie", label: "Demander l'échographie d'une consultation prénatale", roles: ["CAREGIVER"] },
  "imaging.perform": { group: "Imagerie", label: "Réaliser l'examen, déposer les clichés", roles: [...CLINICAL] },
  "imaging.report": { group: "Imagerie", label: "Rédiger et valider le compte rendu", roles: [...DOCTORS] },
  "imaging.catalog": { group: "Imagerie", label: "Gérer le catalogue d'imagerie", roles: ["COORDINATOR"] },
  "maternity.read": { group: "Maternité", label: "Voir le suivi de grossesse", roles: [...ADMIN_READ, ...CLINICAL] },
  "maternity.write": { group: "Maternité", label: "CPN, partogramme, accouchement", roles: [...CLINICAL] },

  // --- Pharmacie, caisse, finance ---
  "pharmacy.access": { group: "Pharmacie", label: "Ouvrir la pharmacie", roles: [...ADMIN_READ, "COORDINATOR", "PHARMACIST"] },
  "pharmacy.catalog.read": { group: "Pharmacie", label: "Voir le catalogue des produits", roles: [...ADMIN_READ, "COORDINATOR", "PHARMACIST", "CASHIER"] },
  "pharmacy.dispense": { group: "Pharmacie", label: "Remettre les médicaments", roles: ["PHARMACIST"] },
  "pharmacy.dispense.cancel": { group: "Pharmacie", label: "Annuler une remise", roles: ["COORDINATOR"] },
  "stock.read": { group: "Pharmacie", label: "Voir le stock et sa valeur", roles: [...ADMIN_READ, "COORDINATOR", "PHARMACIST", "COMPTABLE"] },
  "stock.write": { group: "Pharmacie", label: "Achats, inventaires, corrections de stock", roles: ["COORDINATOR", "PHARMACIST"] },
  "stock.supervise": { group: "Pharmacie", label: "Bloquer la vente d'un produit, annuler un achat, supprimer un produit", roles: ["COORDINATOR"] },
  "caisse.access": { group: "Caisse", label: "Ouvrir la caisse", roles: [...ADMIN_READ, "COORDINATOR", "CASHIER", "PHARMACIST"] },
  "register.read": { group: "Caisse", label: "Voir les caisses et les tickets", roles: [...ADMIN_READ, "COORDINATOR", "CASHIER", "PHARMACIST", "COMPTABLE"] },
  "register.operate": { group: "Caisse", label: "Ouvrir une session, encaisser, enregistrer une dépense", roles: ["COORDINATOR", "CASHIER", "PHARMACIST"] },
  "register.structure": { group: "Caisse", label: "Créer et paramétrer les caisses", roles: ["COORDINATOR"] },
  "invoices.manage": { group: "Caisse", label: "Changer le statut d'un ticket, le supprimer", roles: ["SUPER_ADMIN", ...ADMIN_READ, "COORDINATOR"] },
  "finance.read": { group: "Finance", label: "Voir la finance (journal, synthèse)", roles: [...ADMIN_READ, "COORDINATOR", "COMPTABLE"] },
  "accounting.access": { group: "Finance", label: "Ouvrir la comptabilité", roles: [...ADMIN_READ, "COORDINATOR", "COMPTABLE"] },
  "accounting.read": { group: "Finance", label: "Lire la comptabilité", roles: ["SUPER_ADMIN", ...ADMIN_READ, "COORDINATOR", "COMPTABLE"] },
  "accounting.write": { group: "Finance", label: "Saisir et clôturer en comptabilité", roles: ["COORDINATOR", "COMPTABLE"] },
  "contracts.read": { group: "Finance", label: "Voir les contrats aidants", roles: [...ADMIN_READ, "COORDINATOR"] },
  "contracts.write": { group: "Finance", label: "Gérer les contrats aidants", roles: ["COORDINATOR"] },

  // --- Partenaires ---
  "partners.pick": { group: "Partenaires", label: "Choisir un partenaire sur une demande", roles: [...ADMIN_READ, ...CLINICAL, "LABORANTIN", "COMPTABLE"] },
  "partners.manage": { group: "Partenaires", label: "Créer les partenaires et fixer leurs tarifs", roles: ["COORDINATOR"] },
  "partners.statements": { group: "Partenaires", label: "Voir les relevés des partenaires", roles: [...ADMIN_READ, "COORDINATOR", "COMPTABLE"] },
  "partners.settle": { group: "Partenaires", label: "Enregistrer un règlement de partenaire", roles: ["COORDINATOR", "COMPTABLE"] },
  "partners.settle.cash": { group: "Partenaires", label: "Encaisser un règlement en espèces", roles: ["COORDINATOR"] },

  // --- Clinique, équipe, outils ---
  "clinic.configure": { group: "Administration", label: "Configurer la clinique (services, fonctionnement)", roles: ["COORDINATOR"] },
  "team.manage": { group: "Administration", label: "Gérer l'équipe", roles: [...ADMIN_READ, "COORDINATOR"] },
  "integrations.read": { group: "Administration", label: "Voir les intégrations (HL7, FHIR)", roles: [...ADMIN_READ, "COORDINATOR"] },
  "integrations.manage": { group: "Administration", label: "Gérer les clés d'intégration", roles: ["COORDINATOR"] },
  "audit.read": { group: "Administration", label: "Journal d'audit", roles: [...ADMIN_READ] },
  "ai.use": { group: "Outils", label: "Assistant clinique IA", roles: [...ADMIN_READ, ...DOCTORS] },
  "ai.analyze": { group: "Outils", label: "Analyse IA d'un dossier", roles: [...ADMIN_READ, ...CLINICAL] },
  "ai.clinical": { group: "Outils", label: "Dictée et rédaction IA de consultation", roles: [...DOCTORS] },
  "incidents.access": { group: "Outils", label: "Signaler et suivre les incidents", roles: [...ADMIN_READ, ...CLINICAL, "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER"] },
  "messages.access": { group: "Outils", label: "Messagerie interne", roles: [...ADMIN_READ, ...CLINICAL, "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"] },
  "notifications.access": { group: "Outils", label: "Notifications", roles: ["SUPER_ADMIN", ...ADMIN_READ, ...CLINICAL, "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE"] },
  "manual.access": { group: "Outils", label: "Manuel d'utilisation", roles: ["SUPER_ADMIN", ...ADMIN_READ, ...CLINICAL, "LABORANTIN", "ACCUEIL", "PHARMACIST", "CASHIER", "COMPTABLE", "FAMILY", "PATIENT"] },
  "dashboard.doctor": { group: "Outils", label: "Tableau de bord médecin", roles: ["MEDECIN"] },

  // --- Plateforme (équipe MedDoc) ---
  "platform.holdings": { group: "Plateforme", label: "Gérer les holdings et licences", roles: ["SUPER_ADMIN"] },
  "platform.contact": { group: "Plateforme", label: "Messages de contact du site", roles: ["SUPER_ADMIN"] },

  // --- Ajoutées ensuite : TOUJOURS à la fin (l'ordre du catalogue encode les permissions dans le
  // jeton de session, cf. encodePermissions) ---
  "roles.manage": { group: "Administration", label: "Gérer les rôles et leurs permissions", roles: ["COORDINATOR"] },
  "invoices.discount": { group: "Caisse", label: "Accorder une réduction sur une facture (examen, consultation, médicaments...)", roles: ["COORDINATOR"] },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

// Permissions par défaut de chaque rôle (déduites du catalogue).
export const ROLE_PERMISSIONS: Record<string, ReadonlySet<Permission>> = (() => {
  const byRole: Record<string, Set<Permission>> = {};
  for (const key of PERMISSION_KEYS) {
    for (const role of PERMISSIONS[key].roles) (byRole[role] ??= new Set()).add(key);
  }
  return byRole;
})();

export function rolesWith(permission: Permission): readonly string[] {
  return PERMISSIONS[permission].roles;
}

// Sujet d'un contrôle : un utilisateur (son rôle, et ses permissions effectives calculées par
// src/lib/permissions-server.ts), ou directement un rôle (permissions par défaut).
export type PermissionSubject = string | { role: string; permissions?: readonly string[] | null } | null | undefined;

export function permissionsOf(subject: PermissionSubject): ReadonlySet<string> {
  if (!subject) return new Set();
  if (typeof subject === "string") return ROLE_PERMISSIONS[subject] ?? new Set();
  if (subject.permissions) return new Set(subject.permissions);
  return ROLE_PERMISSIONS[subject.role] ?? new Set();
}

export function can(subject: PermissionSubject, permission: Permission): boolean {
  return permissionsOf(subject).has(permission);
}

export function canAny(subject: PermissionSubject, ...permissions: Permission[]): boolean {
  const owned = permissionsOf(subject);
  return permissions.some((p) => owned.has(p));
}

export function assertCan(subject: PermissionSubject, permission: Permission, message = "Non autorisé."): void {
  if (!can(subject, permission)) throw new Error(message);
}

// --- Pages du tableau de bord (middleware, menu) ---------------------------------------------
// Section (/dashboard/[clinics/<id>/]<section>) → permission requise. Section absente : ouverte à
// tout utilisateur connecté.
export const SECTION_PERMISSIONS: Record<string, Permission> = {
  patients: "records.read",
  accueil: "visits.read",
  team: "team.manage",
  incidents: "incidents.access",
  lab: "lab.read",
  imagerie: "imaging.read",
  maternite: "maternity.read",
  urgences: "triage.read",
  bloc: "surgery.read",
  "banque-sang": "bloodbank.read",
  rooms: "rooms.read",
  ronde: "rounds.run",
  appointments: "calendar.access",
  "ai-assistant": "ai.use",
  medecin: "dashboard.doctor",
  caisse: "caisse.access",
  pharmacie: "pharmacy.access",
  finance: "finance.read",
  comptabilite: "accounting.access",
  partenaires: "partners.statements",
  contracts: "contracts.read",
  roles: "roles.manage",
  "audit-log": "audit.read",
  "contact-messages": "platform.contact",
  holdings: "platform.holdings",
  messages: "messages.access",
  manual: "manual.access",
  notifications: "notifications.access",
};

export function canAccessSection(subject: PermissionSubject, section: string): boolean {
  const permission = SECTION_PERMISSIONS[section];
  return !permission || can(subject, permission);
}

// --- Rôles modifiables par une clinique ------------------------------------------------------
// Rôles du personnel d'une clinique dont le coordinateur peut changer les permissions. Le
// coordinateur lui-même n'est pas modifiable (il ne doit pas pouvoir se retirer l'accès).
export const EDITABLE_CLINIC_ROLES = ["MEDECIN", "CAREGIVER", "ACCUEIL", "LABORANTIN", "PHARMACIST", "CASHIER", "COMPTABLE"] as const;

const CLINIC_STAFF_ROLES: readonly string[] = ["COORDINATOR", ...EDITABLE_CLINIC_ROLES];

// Permissions qu'un rôle de clinique peut recevoir : celles d'au moins un rôle de clinique par
// défaut (jamais plus que le coordinateur : ni plateforme, ni journal d'audit de la holding), sauf la
// gestion des rôles, réservée au coordinateur (sinon un rôle pourrait s'attribuer n'importe quoi).
export const GRANTABLE_PERMISSIONS: readonly Permission[] = PERMISSION_KEYS.filter(
  (key) => key !== "roles.manage" && PERMISSIONS[key].roles.some((role) => CLINIC_STAFF_ROLES.includes(role))
);

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

// --- Encodage compact (jeton de session) -----------------------------------------------------
// Un bit par permission, dans l'ordre du catalogue, en hexadécimal (~30 caractères) : le middleware
// (Edge, sans base) lit ainsi les permissions effectives depuis le jeton. D'où la règle : une
// nouvelle permission s'ajoute EN FIN de catalogue (sinon les jetons en cours seraient mal lus).
export function encodePermissions(permissions: Iterable<string>): string {
  const owned = new Set(permissions);
  const nibbles: number[] = [];
  PERMISSION_KEYS.forEach((key, i) => {
    if (owned.has(key)) nibbles[i >> 2] = (nibbles[i >> 2] ?? 0) | (1 << (i & 3));
  });
  let hex = "";
  for (let i = 0; i < Math.ceil(PERMISSION_KEYS.length / 4); i++) hex += (nibbles[i] ?? 0).toString(16);
  return hex;
}

export function decodePermissions(hex: string): Permission[] {
  const out: Permission[] = [];
  PERMISSION_KEYS.forEach((key, i) => {
    const nibble = parseInt(hex[i >> 2] ?? "0", 16);
    if (!Number.isNaN(nibble) && nibble & (1 << (i & 3))) out.push(key);
  });
  return out;
}
