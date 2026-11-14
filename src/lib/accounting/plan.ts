// Référentiels comptables (SYSCOHADA révisé, comptes utiles à une clinique) — données pures,
// partagées par le moteur, les états et les écrans.

export const JOURNALS = {
  VE: "Ventes",
  AC: "Achats",
  TR: "Trésorerie",
  OD: "Opérations diverses",
  AN: "À-nouveaux",
} as const;
export type Journal = keyof typeof JOURNALS;
export const JOURNAL_CODES = Object.keys(JOURNALS) as Journal[];

// Plan standard. Les sous-comptes propres à une clinique (AccountingAccount) s'y ajoutent.
export const CHART_OF_ACCOUNTS: Record<string, string> = {
  "101": "Capital",
  "104": "Compte de l'exploitant",
  "111": "Réserve légale",
  "121": "Report à nouveau créditeur",
  "129": "Report à nouveau débiteur",
  "131": "Résultat net : bénéfice",
  "139": "Résultat net : perte",
  "162": "Emprunts",
  "213": "Logiciels",
  "221": "Terrains",
  "231": "Bâtiments",
  "234": "Aménagements",
  "241": "Matériel et outillage (matériel médical)",
  "244": "Mobilier, matériel de bureau et informatique",
  "245": "Matériel de transport",
  "2813": "Amortissements des logiciels",
  "2831": "Amortissements des bâtiments",
  "2834": "Amortissements des aménagements",
  "2841": "Amortissements du matériel médical",
  "2844": "Amortissements du mobilier et du matériel de bureau",
  "2845": "Amortissements du matériel de transport",
  "311": "Marchandises (médicaments revendus)",
  "321": "Matières (consommables)",
  "401": "Fournisseurs",
  "408": "Fournisseurs, factures non parvenues",
  "411": "Clients (patients)",
  "4111": "Organismes de prise en charge (tiers payant)",
  "421": "Personnel, avances",
  "422": "Personnel, rémunérations dues",
  "431": "CNPS",
  "441": "Impôt sur les bénéfices",
  "4431": "TVA facturée sur ventes",
  "4432": "TVA facturée sur prestations de services",
  "4441": "TVA due",
  "4449": "Crédit de TVA à reporter",
  "4452": "TVA récupérable sur achats",
  "4454": "TVA récupérable sur services",
  "447": "Autres impôts et taxes",
  "471": "Débiteurs et créditeurs divers",
  "481": "Fournisseurs d'investissements",
  "513": "Chèques à encaisser",
  "521": "Banques",
  "552": "Mobile Money",
  "571": "Caisse",
  "581": "Virements internes",
  "601": "Achats de marchandises (médicaments)",
  "602": "Achats de matières",
  "604": "Achats de consommables médicaux",
  "6051": "Eau",
  "6052": "Électricité",
  "6053": "Autres énergies",
  "6055": "Fournitures de bureau",
  "6056": "Petit matériel",
  "608": "Emballages",
  "618": "Transport",
  "622": "Loyers",
  "624": "Entretien et réparations",
  "625": "Assurances",
  "627": "Publicité",
  "628": "Télécommunications",
  "631": "Frais bancaires",
  "632": "Honoraires",
  "638": "Autres services extérieurs",
  "641": "Impôts et taxes",
  "651": "Pertes sur créances clients",
  "658": "Charges diverses",
  "661": "Salaires",
  "664": "Charges sociales",
  "681": "Dotations aux amortissements",
  "701": "Ventes de marchandises (pharmacie)",
  "702": "Ventes de produits finis",
  "704": "Travaux facturés",
  "706": "Prestations de services",
  "7061": "Consultations",
  "7062": "Actes, soins, examens, imagerie, laboratoire",
  "7063": "Hospitalisation",
  "707": "Produits accessoires",
  "758": "Produits divers (excédents de caisse)",
};

// Libellé d'un compte : le plus long préfixe connu (5211 → « Banques » à défaut d'un sous-compte).
export function accountLabel(account: string, custom: Record<string, string> = {}): string {
  for (let len = account.length; len >= 1; len--) {
    const prefix = account.slice(0, len);
    const label = custom[prefix] ?? CHART_OF_ACCOUNTS[prefix];
    if (label) return len === account.length ? label : `${label} (${account})`;
  }
  return account;
}

// Moyen de paiement → compte de trésorerie par défaut. Un compte bancaire précis choisi par
// l'utilisateur (sous-compte de 521 ou 552) le remplace.
export const PAYMENT_METHODS = ["CASH", "MOBILE", "CARD", "TRANSFER", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_ACCOUNT: Record<PaymentMethod, string> = {
  CASH: "571",
  OTHER: "571",
  MOBILE: "552",
  CARD: "521",
  TRANSFER: "521",
  CHEQUE: "513",
};
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  MOBILE: "Mobile Money",
  CARD: "Carte bancaire",
  TRANSFER: "Virement",
  CHEQUE: "Chèque",
  OTHER: "Autre",
};

// Natures de produits d'une clinique → compte de produit et compte de TVA collectée (si taxable).
export const SALES_ACCOUNTS = {
  CONSULTATION: { account: "7061", vat: "4432" },
  ACT: { account: "7062", vat: "4432" },
  HOSPITALIZATION: { account: "7063", vat: "4432" },
  PHARMACY: { account: "701", vat: "4431" },
  ACCESSORY: { account: "707", vat: "4431" },
} as const;
export type SalesNature = keyof typeof SALES_ACCOUNTS;

// Catégories de dépenses → compte de charge, compte de TVA déductible (null = sans TVA) et
// contrepartie (401 fournisseurs, sauf impôts, salaires et charges sociales).
export const EXPENSE_CATEGORIES = {
  goods: { label: "Médicaments revendus", account: "601", vat: "4452", counterpart: "401" },
  materials: { label: "Matières", account: "602", vat: "4452", counterpart: "401" },
  supplies: { label: "Consommables médicaux", account: "604", vat: "4452", counterpart: "401" },
  water: { label: "Eau", account: "6051", vat: "4452", counterpart: "401" },
  electricity: { label: "Électricité", account: "6052", vat: "4452", counterpart: "401" },
  energy: { label: "Autres énergies", account: "6053", vat: "4452", counterpart: "401" },
  office: { label: "Fournitures de bureau", account: "6055", vat: "4452", counterpart: "401" },
  smallEquipment: { label: "Petit matériel", account: "6056", vat: "4452", counterpart: "401" },
  packaging: { label: "Emballages", account: "608", vat: "4452", counterpart: "401" },
  transport: { label: "Transport", account: "618", vat: "4454", counterpart: "401" },
  rent: { label: "Loyer", account: "622", vat: "4454", counterpart: "401" },
  maintenance: { label: "Entretien et réparations", account: "624", vat: "4454", counterpart: "401" },
  insurance: { label: "Assurances", account: "625", vat: null, counterpart: "401" },
  advertising: { label: "Publicité", account: "627", vat: "4454", counterpart: "401" },
  telecom: { label: "Télécommunications", account: "628", vat: "4454", counterpart: "401" },
  bankFees: { label: "Frais bancaires", account: "631", vat: "4454", counterpart: "401" },
  fees: { label: "Honoraires (médecins vacataires...)", account: "632", vat: "4454", counterpart: "401" },
  otherServices: { label: "Autres services", account: "638", vat: "4454", counterpart: "401" },
  taxes: { label: "Impôts et taxes", account: "641", vat: null, counterpart: "447" },
  salaries: { label: "Salaires", account: "661", vat: null, counterpart: "422" },
  social: { label: "Charges sociales (CNPS)", account: "664", vat: null, counterpart: "431" },
  other: { label: "Autres charges", account: "658", vat: null, counterpart: "401" },
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

// Retraits de caisse qui ne sont PAS des charges : l'argent sort de la caisse sans appauvrir la
// clinique (il va au propriétaire, en banque, à un employé en avance, à un fournisseur déjà
// enregistré, au prêteur). Ils n'entrent pas dans le résultat. `transfer` : l'argent reste à la
// clinique sur un autre compte de trésorerie (virement interne, via 581).
export const WITHDRAWAL_CATEGORIES = {
  ownerDraw: { label: "Prélèvement du propriétaire / associé", account: "104", transfer: false },
  bankDeposit: { label: "Versement en banque", account: "521", transfer: true },
  mobileDeposit: { label: "Dépôt sur Mobile Money", account: "552", transfer: true },
  salaryAdvance: { label: "Avance sur salaire", account: "421", transfer: false },
  supplierPayment: { label: "Paiement d'un fournisseur (achat déjà saisi)", account: "401", transfer: false },
  loanRepayment: { label: "Remboursement d'emprunt", account: "162", transfer: false },
  // Argent rendu au patient (ou sortie qui compense) après une annulation de règlement faite hors
  // caisse : solde le compte d'attente 471 de cette annulation.
  regularization: { label: "Remboursement / correction d'un règlement annulé", account: "471", transfer: false },
} as const;
export type WithdrawalCategory = keyof typeof WITHDRAWAL_CATEGORIES;
// Compte d'attente entre le classement d'un retrait non-charge et son règlement par la caisse.
export const WITHDRAWAL_SUSPENSE_ACCOUNT = "471";
export type CashOutCategory = ExpenseCategory | WithdrawalCategory;
export function isWithdrawalCategory(category: string | null | undefined): category is WithdrawalCategory {
  return !!category && Object.prototype.hasOwnProperty.call(WITHDRAWAL_CATEGORIES, category);
}
export function isCashOutCategory(category: string | null | undefined): category is CashOutCategory {
  return !!category && (Object.prototype.hasOwnProperty.call(EXPENSE_CATEGORIES, category) || isWithdrawalCategory(category));
}
export function cashOutCategoryLabel(category: string | null | undefined): string {
  if (isWithdrawalCategory(category)) return WITHDRAWAL_CATEGORIES[category].label;
  return EXPENSE_CATEGORIES[(category ?? "other") as ExpenseCategory]?.label ?? EXPENSE_CATEGORIES.other.label;
}

// Immobilisations : compte d'immobilisation, compte d'amortissement (null = non amortissable),
// durée par défaut en mois.
export const ASSET_CATEGORIES = {
  software: { label: "Logiciels", account: "213", depreciation: "2813", months: 36 },
  land: { label: "Terrains", account: "221", depreciation: null, months: 0 },
  buildings: { label: "Bâtiments", account: "231", depreciation: "2831", months: 240 },
  fittings: { label: "Aménagements", account: "234", depreciation: "2834", months: 120 },
  equipment: { label: "Matériel médical", account: "241", depreciation: "2841", months: 60 },
  office: { label: "Mobilier et matériel de bureau", account: "244", depreciation: "2844", months: 60 },
  it: { label: "Matériel informatique", account: "244", depreciation: "2844", months: 36 },
  vehicles: { label: "Matériel de transport", account: "245", depreciation: "2845", months: 48 },
} as const;
export type AssetCategory = keyof typeof ASSET_CATEGORIES;
