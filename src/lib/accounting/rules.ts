// Règles comptables pures (sans base de données) : arrondis, TVA, répartition, contrôle des lignes,
// numérotation, amortissement. Montants en FCFA entiers, arrondis une seule fois, à la source.

export class AccountingError extends Error {
  constructor(
    public code: "PERIOD_LOCKED" | "INVALID_LINES" | "UNBALANCED" | "NOT_FOUND" | "ALREADY_REVERSED",
    message: string
  ) {
    super(message);
    this.name = "AccountingError";
  }
}

export const ACCOUNT_PATTERN = /^[1-8][0-9]{1,11}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Arrondi à l'unité, demi vers le haut (y compris pour les négatifs : -0,5 → 0, comme Math.round).
export function roundAmount(value: number): number {
  return Math.round(value);
}

// TVA d'un prix TTC : le total payé ne change pas, la TVA est arrondie et le HT en découle.
export function vatFromTtc(ttc: number, rate: number): { ht: number; vat: number; ttc: number } {
  const total = roundAmount(ttc);
  const vat = rate > 0 ? roundAmount(total - total / (1 + rate)) : 0;
  return { ht: total - vat, vat, ttc: total };
}

// TVA d'un prix HT.
export function vatFromHt(ht: number, rate: number): { ht: number; vat: number; ttc: number } {
  const base = roundAmount(ht);
  const vat = rate > 0 ? roundAmount(base * rate) : 0;
  return { ht: base, vat, ttc: base + vat };
}

// Répartit un total entier au prorata des poids ; l'écart d'arrondi va au poids le plus lourd
// (le premier rencontré en cas d'égalité). La somme des parts vaut toujours exactement le total.
// Tous les poids nuls : rien n'est réparti (le total n'est attribué à aucune clé).
export function allocate<K extends string>(total: number, weights: Record<K, number>): Record<K, number> {
  const keys = Object.keys(weights) as K[];
  const result = {} as Record<K, number>;
  const sum = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);
  for (const k of keys) result[k] = 0;
  if (sum <= 0 || keys.length === 0) return result;
  let heaviest = keys[0];
  for (const k of keys) {
    result[k] = roundAmount((total * Math.max(0, weights[k])) / sum);
    if (weights[k] > weights[heaviest]) heaviest = k;
  }
  const allocated = keys.reduce((s, k) => s + result[k], 0);
  result[heaviest] += total - allocated;
  return result;
}

export interface LineInput {
  account: string;
  debit?: number;
  credit?: number;
  label?: string | null;
  supplierId?: string | null;
  customerId?: string | null;
  closing?: boolean;
}

export interface CleanLine {
  account: string;
  debit: number;
  credit: number;
  label: string;
  supplierId: string | null;
  customerId: string | null;
  closing: boolean;
}

// Étapes 1, 5 et 6 de postEntry : arrondir, libellé par défaut, retirer les lignes à 0, puis
// vérifier comptes, montants, sens et équilibre. Lève INVALID_LINES ou UNBALANCED.
export function prepareLines(lines: LineInput[], defaultLabel: string): CleanLine[] {
  const cleaned: CleanLine[] = lines
    .map((l) => ({
      account: String(l.account ?? "").trim(),
      debit: roundAmount(Number(l.debit ?? 0)),
      credit: roundAmount(Number(l.credit ?? 0)),
      label: (l.label ?? "").trim() || defaultLabel,
      supplierId: l.supplierId ?? null,
      customerId: l.customerId ?? null,
      closing: !!l.closing,
    }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  if (cleaned.length < 2) throw new AccountingError("INVALID_LINES", "Une écriture doit comporter au moins deux lignes non nulles.");
  for (const l of cleaned) {
    if (!ACCOUNT_PATTERN.test(l.account)) throw new AccountingError("INVALID_LINES", `Compte invalide : « ${l.account} ».`);
    if (!Number.isFinite(l.debit) || !Number.isFinite(l.credit)) throw new AccountingError("INVALID_LINES", `Montant invalide sur le compte ${l.account}.`);
    if (l.debit < 0 || l.credit < 0) throw new AccountingError("INVALID_LINES", `Montant négatif sur le compte ${l.account}.`);
    if (l.debit > 0 && l.credit > 0) throw new AccountingError("INVALID_LINES", `Le compte ${l.account} a un débit et un crédit sur la même ligne.`);
  }
  const debit = cleaned.reduce((s, l) => s + l.debit, 0);
  const credit = cleaned.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit || debit === 0) {
    throw new AccountingError("UNBALANCED", `Écriture déséquilibrée : débits ${debit}, crédits ${credit}.`);
  }
  return cleaned;
}

export function formatEntryNumber(journal: string, year: number, sequence: number): string {
  return `${journal}-${year}-${String(sequence).padStart(5, "0")}`;
}

// Une date AAAA-MM-JJ est dans une période verrouillée si elle tombe le jour du verrou ou avant.
export function isLocked(entryDate: string, lockedUntil: string | null | undefined): boolean {
  return !!lockedUntil && entryDate <= lockedUntil;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// Amortissement linéaire cumulé au prorata des jours, à la date asOf (bornes incluses).
export function depreciationCumul(cost: number, months: number, inServiceDate: string, asOf: string): number {
  if (months <= 0 || asOf < inServiceDate) return 0;
  if (asOf >= addMonths(inServiceDate, months)) return cost;
  const days = dayNumber(asOf) - dayNumber(inServiceDate) + 1;
  return Math.min(cost, roundAmount((((cost * 12) / months) * days) / 365));
}
