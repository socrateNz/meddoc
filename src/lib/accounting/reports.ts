// États comptables : fonctions PURES f(lignes, période) → chiffres. Chaque chiffre a une formule
// unique, lue uniquement dans les lignes d'écriture (jamais dans les factures ou les paiements).
// Les dates sont des chaînes AAAA-MM-JJ : la comparaison de chaînes suffit.

export interface ReportLine {
  entryId: string;
  entryNumber?: string;
  entryDate: string;
  occurredAt?: string | null; // instant réel du document (ISO), ordonne une même journée
  journal: string;
  account: string;
  label: string;
  debit: number;
  credit: number;
  supplierId?: string | null;
  customerId?: string | null;
  closing?: boolean;
}

export interface Period {
  from: string;
  to: string;
}

const inPeriod = (l: ReportLine, p: Period) => l.entryDate >= p.from && l.entryDate <= p.to;
const upTo = (l: ReportLine, date: string) => l.entryDate <= date;
const startsWith = (account: string, prefixes: string[]) => prefixes.some((p) => account.startsWith(p));
// Opposé sans « −0 » (un solde nul reste 0, pas −0).
const neg = (value: number) => (value === 0 ? 0 : -value);

// Σ débit − Σ crédit des comptes commençant par l'un des préfixes.
export function balance(lines: ReportLine[], prefixes: string | string[], filter: (l: ReportLine) => boolean = () => true): number {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  return lines.filter((l) => filter(l) && startsWith(l.account, list)).reduce((s, l) => s + l.debit - l.credit, 0);
}

// --- Tableau de bord (§ 8.1) : flux sur la période, soldes cumulés à la date de fin ------------
export interface Dashboard {
  period: Period;
  revenue: number; // CA : crédit − débit des 70x de la période, hors clôture
  expenses: number; // charges : débit − crédit des 6x de la période, hors clôture
  result: number; // produits (classe 7) − charges (classe 6)
  vatCollected: number;
  vatDeductible: number;
  vatNet: number; // > 0 : à payer ; < 0 : crédit de TVA
  cashIn: number; // encaissements : débits des 5x de la période, hors virements internes 581
  // Soldes cumulés « au » period.to :
  cash: number; // 571
  mobileMoney: number; // 552
  bank: number; // 521
  cheques: number; // 513
  supplierDebt: number; // −solde(401)
  patientReceivables: number; // solde(411) hors 4111
  thirdPartyReceivables: number; // solde(4111) : organismes de prise en charge
}

export function dashboard(lines: ReportLine[], period: Period): Dashboard {
  const flow = (l: ReportLine) => inPeriod(l, period) && !l.closing;
  const atEnd = (l: ReportLine) => upTo(l, period.to);
  const revenue = neg(balance(lines, "70", flow));
  const income = neg(balance(lines, "7", flow));
  const expenses = balance(lines, "6", flow);
  const vatCollected = neg(balance(lines, ["4431", "4432"], flow));
  const vatDeductible = balance(lines, ["4452", "4454"], flow);
  // Argent reçu : débits des comptes de trésorerie, moins ce qui y arrive par virement interne
  // (crédits des 58x : versement de la caisse en banque, etc.), qui n'est pas une rentrée.
  const cashIn =
    lines.filter((l) => flow(l) && l.account.startsWith("5") && !l.account.startsWith("58")).reduce((s, l) => s + l.debit, 0) -
    lines.filter((l) => flow(l) && l.account.startsWith("58")).reduce((s, l) => s + l.credit, 0);
  const receivables411 = balance(lines, "411", atEnd);
  const receivables4111 = balance(lines, "4111", atEnd);
  return {
    period,
    revenue,
    expenses,
    result: income - expenses,
    vatCollected,
    vatDeductible,
    vatNet: vatCollected - vatDeductible,
    cashIn,
    cash: balance(lines, "571", atEnd),
    mobileMoney: balance(lines, "552", atEnd),
    bank: balance(lines, "521", atEnd),
    cheques: balance(lines, "513", atEnd),
    supplierDebt: neg(balance(lines, "401", atEnd)),
    patientReceivables: receivables411 - receivables4111,
    thirdPartyReceivables: receivables4111,
  };
}

// Ordre réel : jour, puis heure du document, puis numéro.
export function chronological(a: ReportLine, b: ReportLine) {
  return (
    a.entryDate.localeCompare(b.entryDate) ||
    (a.occurredAt ?? "").localeCompare(b.occurredAt ?? "") ||
    (a.entryNumber ?? "").localeCompare(b.entryNumber ?? "")
  );
}

// --- Grand livre d'un compte (§ 8.3) -----------------------------------------------------------
export interface LedgerRow extends ReportLine {
  running: number;
}
export function ledger(lines: ReportLine[], account: string, period: Period) {
  const mine = lines.filter((l) => l.account.startsWith(account));
  const opening = mine.filter((l) => l.entryDate < period.from).reduce((s, l) => s + l.debit - l.credit, 0);
  const rows = mine.filter((l) => inPeriod(l, period)).sort(chronological);
  let running = opening;
  const withRunning: LedgerRow[] = rows.map((l) => ({ ...l, running: (running += l.debit - l.credit) }));
  const debit = rows.reduce((s, l) => s + l.debit, 0);
  const credit = rows.reduce((s, l) => s + l.credit, 0);
  return { account, opening, rows: withRunning, debit, credit, closing: opening + debit - credit };
}

// --- Balance générale (§ 8.4) ------------------------------------------------------------------
export interface TrialBalanceRow {
  account: string;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
}
const side = (amount: number) => (amount > 0 ? { d: amount, c: 0 } : { d: 0, c: -amount });

export function trialBalance(lines: ReportLine[], period: Period) {
  const byAccount = new Map<string, { opening: number; debit: number; credit: number }>();
  for (const l of lines) {
    if (l.entryDate > period.to) continue;
    const acc = byAccount.get(l.account) ?? { opening: 0, debit: 0, credit: 0 };
    if (l.entryDate < period.from) acc.opening += l.debit - l.credit;
    else {
      acc.debit += l.debit;
      acc.credit += l.credit;
    }
    byAccount.set(l.account, acc);
  }
  const rows: TrialBalanceRow[] = [...byAccount.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, v]) => {
      const o = side(v.opening);
      const c = side(v.opening + v.debit - v.credit);
      return { account, openingDebit: o.d, openingCredit: o.c, debit: v.debit, credit: v.credit, closingDebit: c.d, closingCredit: c.c };
    });
  const totals = rows.reduce(
    (t, r) => ({
      openingDebit: t.openingDebit + r.openingDebit,
      openingCredit: t.openingCredit + r.openingCredit,
      debit: t.debit + r.debit,
      credit: t.credit + r.credit,
      closingDebit: t.closingDebit + r.closingDebit,
      closingCredit: t.closingCredit + r.closingCredit,
    }),
    { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 }
  );
  const balanced = totals.openingDebit === totals.openingCredit && totals.debit === totals.credit && totals.closingDebit === totals.closingCredit;
  return { rows, totals, balanced };
}

// --- Compte de résultat simplifié (§ 8.6) ------------------------------------------------------
export function incomeStatement(lines: ReportLine[], period: Period) {
  const flow = lines.filter((l) => inPeriod(l, period) && !l.closing);
  const group = (cls: string, sign: 1 | -1) => {
    const map = new Map<string, number>();
    for (const l of flow) {
      if (!l.account.startsWith(cls)) continue;
      const key = l.account.slice(0, 2);
      map.set(key, (map.get(key) ?? 0) + sign * (l.debit - l.credit));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, amount]) => ({ group, amount }));
  };
  const charges = group("6", 1);
  const products = group("7", -1);
  const totalCharges = charges.reduce((s, r) => s + r.amount, 0);
  const totalProducts = products.reduce((s, r) => s + r.amount, 0);
  return { charges, products, totalCharges, totalProducts, result: totalProducts - totalCharges };
}

// --- Bilan simplifié à une date (§ 8.5) --------------------------------------------------------
export function balanceSheet(lines: ReportLine[], date: string) {
  const balances = new Map<string, number>();
  for (const l of lines) {
    if (l.entryDate > date) continue;
    balances.set(l.account, (balances.get(l.account) ?? 0) + l.debit - l.credit);
  }
  const assets: { account: string; amount: number }[] = [];
  const liabilities: { account: string; amount: number }[] = [];
  let unallocatedResult = 0; // produits − charges non encore affectés par une clôture
  for (const [account, amount] of [...balances.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (amount === 0) continue;
    const cls = account[0];
    if (cls === "6" || cls === "7" || cls === "8") unallocatedResult -= amount;
    else if (cls === "1") liabilities.push({ account, amount: -amount });
    else if (cls === "2" || cls === "3") assets.push({ account, amount });
    else if (amount > 0) assets.push({ account, amount });
    else liabilities.push({ account, amount: -amount });
  }
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0) + unallocatedResult;
  return { assets, liabilities, unallocatedResult, totalAssets, totalLiabilities, balanced: totalAssets === totalLiabilities };
}

// --- Déclaration de TVA (§ 8.7) ----------------------------------------------------------------
export function vatReturn(lines: ReportLine[], period: Period) {
  const flow = (l: ReportLine) => inPeriod(l, period) && !l.closing;
  const collected = neg(balance(lines, ["4431", "4432"], flow));
  const deductible = balance(lines, ["4452", "4454"], flow);
  const salesBase = neg(balance(lines, "70", flow));
  const net = collected - deductible;
  return { salesBase, collected, deductible, net, toPay: Math.max(0, net), creditCarriedForward: Math.max(0, -net) };
}

// --- Clôture (§ 7.3) : lignes qui soldent les comptes 6, 7, 8 de l'exercice --------------------
export function closingLines(lines: ReportLine[], fiscalYear: Period) {
  const balances = new Map<string, number>();
  for (const l of lines) {
    if (!inPeriod(l, fiscalYear) || l.closing || !/^[678]/.test(l.account)) continue;
    balances.set(l.account, (balances.get(l.account) ?? 0) + l.debit - l.credit);
  }
  const out: { account: string; debit: number; credit: number; closing: true }[] = [];
  let net = 0; // Σ (débit − crédit) des comptes soldés = charges − produits
  for (const [account, amount] of [...balances.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (amount === 0) continue;
    net += amount;
    out.push(amount > 0 ? { account, debit: 0, credit: amount, closing: true } : { account, debit: -amount, credit: 0, closing: true });
  }
  const result = neg(net); // produits − charges
  if (result > 0) out.push({ account: "131", debit: 0, credit: result, closing: true });
  else if (result < 0) out.push({ account: "139", debit: -result, credit: 0, closing: true });
  return { lines: out, result };
}

// --- Contrôles d'intégrité de base (§ 9, n° 1 et 2) ---------------------------------------------
export function integrityChecks(lines: ReportLine[]) {
  const byEntry = new Map<string, number>();
  let invalidLines = 0;
  for (const l of lines) {
    byEntry.set(l.entryId, (byEntry.get(l.entryId) ?? 0) + l.debit - l.credit);
    const bad = !Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0 || (l.debit > 0) === (l.credit > 0);
    if (bad) invalidLines++;
  }
  const unbalancedEntries = [...byEntry.values()].filter((v) => v !== 0).length;
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return { unbalancedEntries, invalidLines, globalBalanced: totalDebit === totalCredit };
}
