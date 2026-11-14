// Séances de caisse → écritures de trésorerie. Les règlements et sorties de caisse sont déjà
// comptabilisés un par un ; il manque ce qui ne passe par aucun document :
//   fond de caisse initial      1re séance d'une caisse : D 571 / C 104 (argent déjà dans le tiroir)
//   écart à la fermeture        compté − attendu : manquant D 658 / C 571, excédent D 571 / C 758
//   argent sorti entre séances  compté à la fermeture − fond à la réouverture :
//                               sorti D 104 / C 571, rajouté D 571 / C 104
// Avec elles, le solde du compte 571 retombe, à chaque fermeture, sur le montant compté.
import { prisma } from "@/lib/db";
import { postEntry, type PostEntryResult } from "./engine";
import { roundAmount, type LineInput } from "./rules";

export const CASH_ACCOUNT = "571";
export const OWNER_ACCOUNT = "104";
export const CASH_SHORTAGE_ACCOUNT = "658";
export const CASH_SURPLUS_ACCOUNT = "758";

// Seuls les règlements en espèces sont dans le tiroir (Mobile Money, carte, virement, chèque n'y
// sont pas). Les anciens mouvements, sans moyen de paiement, sont des espèces.
export function isDrawerCash(paymentMethod: string | null | undefined) {
  return !paymentMethod || paymentMethod === "CASH";
}

export interface SessionInput {
  id: string;
  registerId: string;
  registerName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingFloat: number;
  countedAmount: number | null;
  status: string;
}
export interface SessionMovement {
  cashSessionId: string | null;
  type: string;
  amount: number;
  paymentMethod: string | null;
}
export interface CashEntry {
  sourceType: "CASH_OPENING" | "CASH_VARIANCE" | "CASH_HANDOVER";
  sourceId: string;
  date: Date;
  label: string;
  lines: LineInput[];
}

// Espèces attendues dans le tiroir à la fermeture : fond + encaissements − sorties en espèces.
export function expectedCash(session: Pick<SessionInput, "id" | "openingFloat">, movements: SessionMovement[]) {
  let total = session.openingFloat;
  for (const m of movements) {
    if (m.cashSessionId !== session.id || !isDrawerCash(m.paymentMethod)) continue;
    if (m.type === "INCOME") total += m.amount;
    else if (m.type === "EXPENSE") total -= m.amount;
  }
  return roundAmount(total);
}

const entry = (amount: number, debit: string, credit: string): LineInput[] => [
  { account: debit, debit: amount },
  { account: credit, credit: amount },
];

// Écritures dues pour les séances d'une clinique (pur, testable).
export function cashSessionEntries(sessions: SessionInput[], movements: SessionMovement[]): CashEntry[] {
  const out: CashEntry[] = [];
  const byRegister = new Map<string, SessionInput[]>();
  for (const s of sessions) byRegister.set(s.registerId, [...(byRegister.get(s.registerId) ?? []), s]);

  for (const list of byRegister.values()) {
    list.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
    list.forEach((s, i) => {
      const float = roundAmount(s.openingFloat);
      if (i === 0 && float > 0) {
        out.push({ sourceType: "CASH_OPENING", sourceId: s.id, date: s.openedAt, label: `Fond de caisse initial — ${s.registerName}`, lines: entry(float, CASH_ACCOUNT, OWNER_ACCOUNT) });
      }
      if (i > 0) {
        const prev = list[i - 1];
        if (prev.status === "CLOSED") {
          const left = prev.countedAmount ?? expectedCash(prev, movements);
          const gap = roundAmount(left) - float;
          const date = new Date((prev.closedAt ?? s.openedAt).getTime() + 1);
          if (gap > 0) {
            out.push({ sourceType: "CASH_HANDOVER", sourceId: s.id, date, label: `Argent sorti de la caisse entre deux séances — ${s.registerName}`, lines: entry(gap, OWNER_ACCOUNT, CASH_ACCOUNT) });
          } else if (gap < 0) {
            out.push({ sourceType: "CASH_HANDOVER", sourceId: s.id, date, label: `Argent ajouté à la caisse entre deux séances — ${s.registerName}`, lines: entry(-gap, CASH_ACCOUNT, OWNER_ACCOUNT) });
          }
        }
      }
      if (s.status === "CLOSED" && s.countedAmount != null) {
        const variance = roundAmount(s.countedAmount) - expectedCash(s, movements);
        const date = s.closedAt ?? s.openedAt;
        if (variance < 0) {
          out.push({ sourceType: "CASH_VARIANCE", sourceId: s.id, date, label: `Manquant de caisse à la fermeture — ${s.registerName}`, lines: entry(-variance, CASH_SHORTAGE_ACCOUNT, CASH_ACCOUNT) });
        } else if (variance > 0) {
          out.push({ sourceType: "CASH_VARIANCE", sourceId: s.id, date, label: `Excédent de caisse à la fermeture — ${s.registerName}`, lines: entry(variance, CASH_ACCOUNT, CASH_SURPLUS_ACCOUNT) });
        }
      }
    });
  }
  return out;
}

// Comptabilise les séances d'une clinique (ou d'une seule caisse). Idempotent.
export async function postCashSessions(organizationId: string, registerId?: string): Promise<PostEntryResult[]> {
  const sessions = await prisma.cashSession.findMany({
    where: { organizationId, ...(registerId ? { registerId } : {}) },
    include: { register: { select: { name: true } } },
  });
  if (!sessions.length) return [];
  const movements = await prisma.financialTransaction.findMany({
    where: { cashSessionId: { in: sessions.map((s) => s.id) } },
    select: { cashSessionId: true, type: true, amount: true, paymentMethod: true },
  });
  const entries = cashSessionEntries(
    sessions.map((s) => ({
      id: s.id,
      registerId: s.registerId,
      registerName: s.register?.name ?? "Caisse",
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingFloat: s.openingFloat,
      countedAmount: s.countedAmount,
      status: s.status,
    })),
    movements
  );
  const results: PostEntryResult[] = [];
  for (const e of entries) {
    results.push(await postEntry({ organizationId, journal: e.sourceType === "CASH_HANDOVER" || e.sourceType === "CASH_OPENING" ? "OD" : "TR", date: e.date, label: e.label, sourceType: e.sourceType, sourceId: e.sourceId, lines: e.lines }));
  }
  return results;
}
