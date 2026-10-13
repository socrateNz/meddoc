"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyPatientAccess } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { stayInvoiceLines, stayNightsToDate } from "@/lib/hospital-stay";
import { assertUserModule } from "@/lib/modules-server";

// Séjour d'hospitalisation en cours d'un patient (cf. src/lib/hospital-stay.ts) : consultation par
// le personnel clinique, correction de la date d'entrée par le coordinateur.
const STAY_READ_ROLES = ["ADMIN", "COORDINATOR", "MEDECIN", "CAREGIVER"];
const STAY_CORRECT_ROLES = ["COORDINATOR"];

export async function getOpenStaySummary(patientId: string) {
  try {
    z.string().min(1).parse(patientId);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "HOSPITALISATION");
    if (!STAY_READ_ROLES.includes(activeUser.role)) throw new Error("Non autorisé.");
    if (!(await verifyPatientAccess(patientId, activeUser))) throw new Error("Non autorisé.");

    const stay = await prisma.hospitalStay.findFirst({
      where: { patientId, status: "OPEN" },
      include: { bedStays: { orderBy: { startedAt: "asc" } } },
      orderBy: { admittedAt: "desc" },
    });
    if (!stay) return { success: true as const, data: null };

    const now = new Date();
    const nights = stayNightsToDate(stay.bedStays, now);
    const amountToDate = nights.reduce((sum, n) => sum + n.nightlyRate, 0);
    const { lines } = stayInvoiceLines(nights, stay.nightsBilled);
    const current = stay.bedStays.find((b) => !b.endedAt) ?? null;

    return {
      success: true as const,
      data: {
        stayId: stay.id,
        admittedAt: stay.admittedAt.toISOString(),
        nightsToDate: nights.length,
        nightsBilled: stay.nightsBilled,
        amountToDate,
        amountNotYetBilled: lines.reduce((sum, l) => sum + l.amount, 0),
        currentBed: current ? { wardName: current.wardName, roomName: current.roomName, bedLabel: current.bedLabel, nightlyRate: current.nightlyRate } : null,
        // La date d'entrée n'est corrigeable que tant qu'aucune nuitée n'a été facturée.
        canCorrectAdmission: STAY_CORRECT_ROLES.includes(activeUser.role) && stay.nightsBilled === 0,
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement du séjour.") };
  }
}

// Corrige la date d'entrée d'un séjour — notamment pour les patients déjà hospitalisés au moment
// de la mise en service de la facturation des nuitées (cf. scripts/migrate-open-hospital-stays.mjs),
// dont le séjour démarre par défaut à la date de migration. Interdit dès qu'une nuitée a été
// facturée : on ne modifie jamais rétroactivement ce qui a déjà été porté sur une facture.
export async function correctStayAdmission(data: { stayId: string; admittedAt: string }) {
  try {
    z.object({ stayId: z.string().min(1), admittedAt: z.string().min(1) }).parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertUserModule(activeUser, "HOSPITALISATION");
    if (!STAY_CORRECT_ROLES.includes(activeUser.role)) throw new Error("Non autorisé. Réservé aux coordinateurs.");

    const admittedAt = new Date(data.admittedAt);
    if (Number.isNaN(admittedAt.getTime())) throw new Error("Date d'entrée invalide.");
    if (admittedAt > new Date()) throw new Error("La date d'entrée ne peut pas être dans le futur.");

    const stay = await prisma.hospitalStay.findUnique({
      where: { id: data.stayId },
      include: { bedStays: { orderBy: { startedAt: "asc" } } },
    });
    if (!stay) throw new Error("Séjour introuvable.");
    if (!(await verifyPatientAccess(stay.patientId, activeUser))) throw new Error("Non autorisé.");
    if (stay.status !== "OPEN") throw new Error("Ce séjour est clôturé.");
    if (stay.nightsBilled > 0) throw new Error("Des nuitées de ce séjour ont déjà été facturées : la date d'entrée ne peut plus être modifiée.");

    const first = stay.bedStays[0];
    if (first?.endedAt && admittedAt >= first.endedAt) {
      throw new Error("La date d'entrée doit précéder la fin de la première période d'occupation.");
    }

    await prisma.$transaction(async (tx) => {
      // Conditionné à « rien de facturé » : une facturation concurrente fait échouer la correction.
      const claim = await tx.hospitalStay.updateMany({
        where: { id: stay.id, status: "OPEN", nightsBilled: 0 },
        data: { admittedAt },
      });
      if (claim.count === 0) throw new Error("Le séjour vient d'être facturé ou clôturé. Rechargez la page.");
      if (first) await tx.bedStay.update({ where: { id: first.id }, data: { startedAt: admittedAt } });
    });

    await logAuditAction(activeUser.id, "CORRECT_STAY_ADMISSION", "HospitalStay", stay.id, {
      previousAdmittedAt: stay.admittedAt.toISOString(),
      admittedAt: admittedAt.toISOString(),
    });
    revalidatePath(`/dashboard/patients/${stay.patientId}`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la correction de la date d'entrée.") };
  }
}
