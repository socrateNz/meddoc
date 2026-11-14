// Moteur comptable : postEntry est le SEUL point d'écriture dans les lignes comptables. Toute
// écriture, automatique ou manuelle, passe par lui, dans une transaction MongoDB.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { clinicDateKey } from "@/lib/clinic-day";
import { AccountingError, DATE_PATTERN, formatEntryNumber, isLocked, prepareLines, type LineInput } from "./rules";
import type { Journal } from "./plan";
import type { ReportLine } from "./reports";

export interface PostEntryInput {
  organizationId: string;
  journal: Journal;
  date: string | Date; // AAAA-MM-JJ, ou un instant converti en jour civil à Douala
  label: string;
  reference?: string | null;
  sourceType?: string;
  sourceId?: string | null;
  reversalOf?: string | null;
  createdById?: string | null;
  lines: LineInput[];
}

export interface PostEntryResult {
  id: string;
  number: string;
  created: boolean; // false : une écriture existait déjà pour ce document (idempotence)
}

type Client = typeof prisma;
// Comptabilisations simultanées d'une même clinique : les transactions perdantes sont relancées
// après une courte attente aléatoire, pour ne pas se heurter de nouveau au même instant.
const MAX_ATTEMPTS = 25;
const backoff = (attempt: number) => new Promise((r) => setTimeout(r, Math.min(200, 10 * attempt) + Math.random() * 40));

const newObjectId = () => randomBytes(12).toString("hex");

export function toEntryDate(date: string | Date): string {
  if (typeof date === "string") {
    if (!DATE_PATTERN.test(date)) throw new AccountingError("INVALID_LINES", `Date comptable invalide : « ${date} ».`);
    return date;
  }
  return clinicDateKey(date);
}

// Conflit d'écriture entre deux transactions simultanées (P2034) : l'une est relancée.
function isWriteConflict(error: unknown) {
  const e = error as { code?: string; message?: string };
  return e?.code === "P2034" || /write ?conflict/i.test(e?.message ?? "");
}

export async function postEntry(input: PostEntryInput, client: Client = prisma): Promise<PostEntryResult> {
  const entryDate = toEntryDate(input.date);
  const sourceType = input.sourceType ?? "MANUAL";
  const label = input.label.trim().slice(0, 250);

  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(async (tx) => {
        // Sérialisation par clinique : toute comptabilisation commence par écrire dans la
        // clinique ; deux transactions simultanées entrent en conflit et l'une est relancée.
        const org = await tx.organization.update({
          where: { id: input.organizationId },
          data: { accountingSeq: { increment: 1 } },
          select: { accountingLockedUntil: true },
        });

        // Idempotence AVANT le verrou : recomptabiliser un document déjà comptabilisé n'est
        // jamais une erreur, même sur une période close.
        const sourceKey = input.sourceId
          ? `${input.organizationId}:${sourceType}:${input.sourceId}`
          : `${input.organizationId}:MANUAL:${newObjectId()}`;
        if (input.sourceId) {
          const existing = await tx.accountingEntry.findUnique({ where: { sourceKey }, select: { id: true, number: true } });
          if (existing) return { id: existing.id, number: existing.number, created: false };
        }

        if (isLocked(entryDate, org.accountingLockedUntil)) {
          throw new AccountingError("PERIOD_LOCKED", `La période est verrouillée jusqu'au ${org.accountingLockedUntil} inclus.`);
        }

        const lines = prepareLines(input.lines, label);

        const year = Number(entryDate.slice(0, 4));
        const counter = await tx.accountingCounter.upsert({
          where: { organizationId_journal_year: { organizationId: input.organizationId, journal: input.journal, year } },
          create: { organizationId: input.organizationId, journal: input.journal, year, lastNumber: 1 },
          update: { lastNumber: { increment: 1 } },
        });
        const number = formatEntryNumber(input.journal, year, counter.lastNumber);

        const entry = await tx.accountingEntry.create({
          data: {
            organizationId: input.organizationId,
            journal: input.journal,
            number,
            entryDate,
            label,
            reference: input.reference ?? null,
            sourceType,
            sourceId: input.sourceId ?? null,
            sourceKey,
            reversalOf: input.reversalOf ?? null,
            createdById: input.createdById ?? null,
          },
          select: { id: true },
        });
        await tx.accountingLine.createMany({
          data: lines.map((l) => ({
            entryId: entry.id,
            organizationId: input.organizationId,
            journal: input.journal,
            entryDate,
            account: l.account,
            label: l.label,
            debit: BigInt(l.debit),
            credit: BigInt(l.credit),
            supplierId: l.supplierId,
            customerId: l.customerId,
            closing: l.closing,
          })),
        });
        return { id: entry.id, number, created: true };
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && isWriteConflict(error)) {
        await backoff(attempt);
        continue;
      }
      throw error;
    }
  }
}

// Contrepassation : nouvelle écriture OD aux sens inversés, l'originale n'est jamais modifiée.
// sourceId = l'écriture d'origine : une même écriture ne peut être contrepassée qu'une fois.
export async function reverseEntry(
  entryId: string,
  options: { date?: string | Date; reason?: string; sourceType?: string; createdById?: string | null } = {},
  client: Client = prisma
): Promise<PostEntryResult> {
  const entry = await client.accountingEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
  if (!entry) throw new AccountingError("NOT_FOUND", "Écriture introuvable.");
  const closing = entry.sourceType.startsWith("YEAR_CLOSING");
  return postEntry(
    {
      organizationId: entry.organizationId,
      journal: "OD",
      date: options.date ?? new Date(),
      label: `Contrepassation ${entry.number}${options.reason ? ` — ${options.reason}` : ""}`,
      reference: entry.reference,
      sourceType: options.sourceType ?? "REVERSAL",
      sourceId: entry.id,
      reversalOf: entry.id,
      createdById: options.createdById ?? null,
      lines: entry.lines.map((l) => ({
        account: l.account,
        debit: Number(l.credit),
        credit: Number(l.debit),
        label: l.label,
        supplierId: l.supplierId,
        customerId: l.customerId,
        closing: closing || l.closing,
      })),
    },
    client
  );
}

// Lignes d'une clinique jusqu'à une date (incluse), converties pour les états purs.
export async function loadReportLines(organizationId: string, to: string, client: Client = prisma): Promise<ReportLine[]> {
  const rows = await client.accountingLine.findMany({
    where: { organizationId, entryDate: { lte: to } },
    include: { entry: { select: { number: true } } },
    orderBy: [{ entryDate: "asc" }],
  });
  return rows.map((l) => ({
    entryId: l.entryId,
    entryNumber: l.entry.number,
    entryDate: l.entryDate,
    journal: l.journal,
    account: l.account,
    label: l.label,
    debit: Number(l.debit),
    credit: Number(l.credit),
    supplierId: l.supplierId,
    customerId: l.customerId,
    closing: l.closing,
  }));
}
