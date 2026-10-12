import type { Prisma } from "@prisma/client";
import { resolveNightlyRate, stayInvoiceLines, stayNightsToDate } from "@/lib/hospital-stay";

// Opérations base du séjour d'hospitalisation (HospitalStay / BedStay), toujours appelées dans la
// transaction Prisma de l'action appelante (affectation/libération de lit, sortie, changement de
// clinique) — cf. src/lib/hospital-stay.ts pour les règles de calcul.

type Tx = Prisma.TransactionClient;

// Une période en cours n'a pas encore de date de fin. Champ optionnel : sur MongoDB, { endedAt:
// null } ne retrouve pas les documents où il est ABSENT, d'où isSet: false.
const OPEN_SEGMENT: Prisma.BedStayWhereInput = { OR: [{ endedAt: null }, { endedAt: { isSet: false } }] };

export async function findOpenStay(tx: Tx, patientId: string) {
  return tx.hospitalStay.findFirst({ where: { patientId, status: "OPEN" }, orderBy: { admittedAt: "desc" } });
}

// Affectation d'un lit : ouvre le séjour s'il n'y en a pas encore, ferme la période en cours
// (transfert) et en ouvre une nouvelle au tarif du nouveau lit, figé à cet instant.
export async function openBedSegment(
  tx: Tx,
  params: {
    patientId: string;
    organizationId: string;
    bed: {
      id: string;
      label: string;
      room: { name: string; nightlyRate?: number | null };
      ward: { name: string; nightlyRate?: number | null };
    };
    userId: string;
    at?: Date;
  }
) {
  const at = params.at ?? new Date();
  let stay = await findOpenStay(tx, params.patientId);
  if (!stay) {
    stay = await tx.hospitalStay.create({
      data: { patientId: params.patientId, organizationId: params.organizationId, admittedAt: at, admittedById: params.userId },
    });
  }
  await tx.bedStay.updateMany({
    where: { hospitalStayId: stay.id, ...OPEN_SEGMENT },
    data: { endedAt: at, endedReason: "TRANSFER" },
  });
  await tx.bedStay.create({
    data: {
      hospitalStayId: stay.id,
      patientId: params.patientId,
      bedId: params.bed.id,
      bedLabel: params.bed.label,
      roomName: params.bed.room.name,
      wardName: params.bed.ward.name,
      organizationId: params.organizationId,
      nightlyRate: resolveNightlyRate(params.bed.ward, params.bed.room),
      startedAt: at,
    },
  });
  return stay;
}

// Libération / sortie / changement de clinique : ferme la période en cours du séjour ouvert.
export async function closeOpenSegment(tx: Tx, patientId: string, reason: "RELEASE" | "DISCHARGE" | "CLINIC_CHANGE", at: Date = new Date()) {
  const stay = await findOpenStay(tx, patientId);
  if (!stay) return null;
  await tx.bedStay.updateMany({
    where: { hospitalStayId: stay.id, ...OPEN_SEGMENT },
    data: { endedAt: at, endedReason: reason },
  });
  return stay;
}

// Facture les nuitées dues à date et pas encore facturées : une facture « Frais de séjour » à la
// caisse, avec une ligne par lit occupé. Peut être appelée plusieurs fois (tentative de sortie
// bloquée par un reste à payer, puis sortie effective) : seules les nouvelles nuits sont portées.
export async function billStayToDate(
  tx: Tx,
  params: { stayId: string; userId: string; now?: Date }
): Promise<{ invoiceId: string | null; nights: number; amount: number }> {
  const now = params.now ?? new Date();
  const stay = await tx.hospitalStay.findUnique({ where: { id: params.stayId }, include: { bedStays: true } });
  if (!stay) return { invoiceId: null, nights: 0, amount: 0 };

  const nights = stayNightsToDate(stay.bedStays, now);
  const { lines, nightsCovered } = stayInvoiceLines(nights, stay.nightsBilled);
  if (nightsCovered === 0) return { invoiceId: null, nights: 0, amount: 0 };

  // Réservation conditionnée au compteur lu : deux facturations simultanées du même séjour ne
  // peuvent pas porter deux fois les mêmes nuits.
  const claim = await tx.hospitalStay.updateMany({
    where: { id: stay.id, nightsBilled: stay.nightsBilled },
    data: { nightsBilled: stay.nightsBilled + nightsCovered },
  });
  if (claim.count === 0) throw new Error("Le séjour est en cours de facturation par un autre utilisateur. Réessayez.");

  if (lines.length === 0) return { invoiceId: null, nights: nightsCovered, amount: 0 };
  const invoice = await tx.pendingInvoice.create({
    data: {
      status: "PENDING",
      patientId: stay.patientId,
      organizationId: stay.organizationId,
      items: lines as unknown as Prisma.InputJsonValue,
      createdById: params.userId,
      hospitalStayId: stay.id,
    },
  });
  return { invoiceId: invoice.id, nights: nightsCovered, amount: lines.reduce((sum, l) => sum + l.amount, 0) };
}

// Reste à payer total du patient : factures en attente ou partiellement réglées (les tickets
// clôturés, CANCELLED, ne sont plus dus — cf. closeUnpaidInvoice).
export async function patientOutstanding(tx: Tx, patientId: string) {
  const invoices = await tx.pendingInvoice.findMany({
    where: { patientId, status: { in: ["PENDING", "PARTIAL"] } },
    select: { id: true, items: true, createdAt: true, hospitalStayId: true },
  });
  if (invoices.length === 0) return { total: 0, invoices: [] as { id: string; due: number; isStay: boolean }[] };
  const paid = await tx.financialTransaction.groupBy({
    by: ["pendingInvoiceId"],
    where: { pendingInvoiceId: { in: invoices.map((i) => i.id) } },
    _sum: { amount: true },
  });
  const paidById = new Map(paid.map((p) => [p.pendingInvoiceId, p._sum.amount || 0]));
  const detailed = invoices
    .map((inv) => {
      const items = Array.isArray(inv.items) ? (inv.items as { amount?: number | string }[]) : [];
      const total = items.reduce((sum, it) => sum + Number(it?.amount || 0), 0);
      return { id: inv.id, due: Math.max(0, total - (paidById.get(inv.id) || 0)), isStay: !!inv.hospitalStayId };
    })
    .filter((inv) => inv.due > 0);
  return { total: detailed.reduce((sum, inv) => sum + inv.due, 0), invoices: detailed };
}
