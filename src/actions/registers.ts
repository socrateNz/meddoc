"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import {
  createRegisterSchema,
  openRegisterSessionSchema,
  closeRegisterSessionSchema,
} from "@/validators/registers";
import { revalidatePath } from "next/cache";
import { assertRegisterOperateRole } from "@/actions/register-permissions";

// Consulter les caisses (et leur état) est ouvert à ADMIN (holding, lecture seule) en plus des
// rôles qui opèrent réellement la caisse. Créer/désactiver une caisse physique est une
// opération structurelle réservée au coordinateur (même périmètre que src/actions/wards.ts).
// Ouvrir/fermer une session et encaisser reste ouvert au CASHIER dédié, au COORDINATOR en secours,
// et pour le moment aussi au PHARMACIST (cf. register-permissions.ts:REGISTER_OPERATE_ROLES —
// le pharmacien s'y comporte temporairement comme un caissier, séparation caisse/pharmacie
// assouplie en attendant qu'un caissier dédié soit en place).
// assertRegisterOperateRole vit dans @/actions/register-permissions (pas "use server") car ce
// fichier-ci ne peut exporter que des fonctions async — voir ce module pour le détail.
const REGISTER_READ_ROLES = ["ADMIN", "COORDINATOR", "CASHIER", "PHARMACIST"];
const REGISTER_STRUCTURE_ROLES = ["COORDINATOR"];

function assertRegisterReadRole(role: string) {
  if (!REGISTER_READ_ROLES.includes(role)) throw new Error("Non autorisé.");
}

function assertRegisterStructureRole(role: string) {
  if (!REGISTER_STRUCTURE_ROLES.includes(role)) throw new Error("Non autorisé. Réservé aux coordinateurs.");
}

// Cette clinique doit être la propre clinique de l'utilisateur, ou une clinique rattachée à la
// holding dont il est administrateur — copié de src/actions/wards.ts:assertClinicScope (même
// contrôle multi-tenant, dupliqué par fichier d'actions selon la convention du projet).
async function assertClinicScope(clinicId: string, activeUser: any) {
  const isOwnClinic = activeUser.organizationId === clinicId;
  const isChildOfHolding =
    activeUser.organization?.type === "HOLDING" &&
    (await prisma.organization.findFirst({ where: { id: clinicId, parentId: activeUser.organizationId } })) !== null;
  if (!isOwnClinic && !isChildOfHolding) {
    throw new Error("Non autorisé. Cette clinique ne fait pas partie de votre établissement.");
  }
}

export async function listRegistersWithStatus(clinicId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser.role);
    await assertClinicScope(clinicId, activeUser);

    const registers = await prisma.cashRegister.findMany({
      where: { organizationId: clinicId },
      include: {
        sessions: {
          where: { status: "OPEN" },
          include: { openedBy: { select: { firstName: true, lastName: true } } },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const data = registers.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      openSession: r.sessions[0] || null,
    }));

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement des caisses.") };
  }
}

export async function createRegister(data: { organizationId: string; name: string }) {
  try {
    createRegisterSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterStructureRole(activeUser.role);
    await assertClinicScope(data.organizationId, activeUser);

    const register = await prisma.cashRegister.create({
      data: { name: data.name, organizationId: data.organizationId },
    });

    await logAuditAction(activeUser.id, "CREATE_CASH_REGISTER", "CashRegister", register.id, { name: data.name });
    revalidatePath(`/dashboard/clinics/${data.organizationId}/caisse`);
    return { success: true, data: register };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la création de la caisse.") };
  }
}

export async function deactivateRegister(id: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterStructureRole(activeUser.role);

    const existing = await prisma.cashRegister.findUnique({ where: { id } });
    if (!existing) throw new Error("Caisse introuvable.");
    await assertClinicScope(existing.organizationId, activeUser);

    const openSession = await prisma.cashSession.findFirst({ where: { registerId: id, status: "OPEN" } });
    if (openSession) {
      throw new Error("Impossible de désactiver une caisse dont la session est encore ouverte. Fermez-la d'abord.");
    }

    await prisma.cashRegister.update({ where: { id }, data: { isActive: false } });

    await logAuditAction(activeUser.id, "DEACTIVATE_CASH_REGISTER", "CashRegister", id, { name: existing.name });
    revalidatePath(`/dashboard/clinics/${existing.organizationId}/caisse`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la désactivation de la caisse.") };
  }
}

export async function openRegisterSession(data: { registerId: string; openingFloat: number }) {
  try {
    openRegisterSessionSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    const register = await prisma.cashRegister.findUnique({ where: { id: data.registerId } });
    if (!register || !register.isActive) throw new Error("Caisse introuvable ou désactivée.");
    await assertClinicScope(register.organizationId, activeUser);

    const existingOpen = await prisma.cashSession.findFirst({ where: { registerId: data.registerId, status: "OPEN" } });
    if (existingOpen) {
      throw new Error("Cette caisse a déjà une session ouverte.");
    }

    const session = await prisma.cashSession.create({
      data: {
        registerId: data.registerId,
        organizationId: register.organizationId,
        openedById: activeUser.id,
        openingFloat: Number(data.openingFloat),
      },
    });

    await logAuditAction(activeUser.id, "OPEN_CASH_SESSION", "CashSession", session.id, {
      registerId: data.registerId,
      openingFloat: data.openingFloat,
    });
    revalidatePath(`/dashboard/clinics/${register.organizationId}/caisse`);
    return { success: true, data: session };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de l'ouverture de la caisse.") };
  }
}

// Calculé à la lecture (jamais persisté) pour ne jamais devenir périmé entre deux consultations
// de l'écran de caisse.
export async function getSessionSummary(sessionId: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser.role);

    const session = await prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        register: { select: { id: true, name: true } },
        openedBy: { select: { firstName: true, lastName: true } },
        closedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!session) throw new Error("Session de caisse introuvable.");
    await assertClinicScope(session.organizationId, activeUser);

    const rawTransactions = await prisma.financialTransaction.findMany({
      where: { cashSessionId: sessionId },
      include: {
        recordedBy: { select: { firstName: true, lastName: true } },
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        // Référence pour l'impression du ticket (cf. invoice-modal.tsx) : doit correspondre à
        // celle que le pharmacien devra saisir pour finaliser (dispensePendingInvoice), pas à
        // l'id interne de la transaction.
        pendingInvoices: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    const transactions = rawTransactions.map((t) => ({ ...t, pendingInvoiceId: t.pendingInvoices[0]?.id }));

    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === "INCOME") totalIncome += t.amount;
      else if (t.type === "EXPENSE") totalExpenses += t.amount;
    }
    const expectedAmount = session.openingFloat + totalIncome - totalExpenses;
    const variance = session.countedAmount != null ? session.countedAmount - expectedAmount : null;

    const pendingInvoices = await prisma.pendingInvoice.findMany({
      where: { organizationId: session.organizationId, status: "PENDING" },
      include: { patient: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: { session, transactions, pendingInvoices, totalIncome, totalExpenses, expectedAmount, variance },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de la session de caisse.") };
  }
}

// Historique des sessions de caisse (ouvertures/fermetures) — alimente le tableau « Rapport de
// caisse » de la page Finance. Les totaux sont recalculés à la lecture à partir des transactions
// liées (jamais persistés), comme getSessionSummary/closeRegisterSession.
export async function listCashSessions(organizationId?: string) {
  try {
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterReadRole(activeUser.role);

    const where: any = {};
    if (activeUser.organization?.type === "HOLDING" && !organizationId) {
      where.OR = [
        { organizationId: activeUser.organizationId },
        { organization: { parentId: activeUser.organizationId } },
      ];
    } else {
      const targetOrgId = organizationId || activeUser.organizationId;
      if (targetOrgId) where.organizationId = targetOrgId;
    }

    const sessions = await prisma.cashSession.findMany({
      where,
      include: {
        register: { select: { name: true } },
        openedBy: { select: { firstName: true, lastName: true } },
        closedBy: { select: { firstName: true, lastName: true } },
        transactions: { select: { type: true, amount: true } },
      },
      orderBy: { openedAt: "desc" },
      take: 200,
    });

    const data = sessions.map((s) => {
      let totalIncome = 0;
      let totalExpenses = 0;
      for (const t of s.transactions) {
        if (t.type === "INCOME") totalIncome += t.amount;
        else totalExpenses += t.amount;
      }
      const expectedAmount = s.openingFloat + totalIncome - totalExpenses;
      const variance = s.countedAmount != null ? s.countedAmount - expectedAmount : null;
      return {
        id: s.id,
        registerName: s.register.name,
        status: s.status,
        openedAt: s.openedAt,
        openedBy: s.openedBy,
        openingFloat: s.openingFloat,
        closedAt: s.closedAt,
        closedBy: s.closedBy,
        countedAmount: s.countedAmount,
        notes: s.notes,
        totalIncome,
        totalExpenses,
        expectedAmount,
        variance,
        transactionCount: s.transactions.length,
      };
    });

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de l'historique des caisses.") };
  }
}

export async function closeRegisterSession(data: { sessionId: string; countedAmount: number; notes?: string }) {
  try {
    closeRegisterSessionSchema.parse(data);
    const activeUser = await getCurrentUser();
    if (!activeUser) throw new Error("Non authentifié.");
    assertRegisterOperateRole(activeUser.role);

    const session = await prisma.cashSession.findUnique({ where: { id: data.sessionId } });
    if (!session) throw new Error("Session de caisse introuvable.");
    if (session.status !== "OPEN") throw new Error("Cette session de caisse est déjà fermée.");
    await assertClinicScope(session.organizationId, activeUser);

    const transactions = await prisma.financialTransaction.findMany({ where: { cashSessionId: data.sessionId } });
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
      if (t.type === "INCOME") totalIncome += t.amount;
      else if (t.type === "EXPENSE") totalExpenses += t.amount;
    }
    const expectedAmount = session.openingFloat + totalIncome - totalExpenses;
    const variance = Number(data.countedAmount) - expectedAmount;

    const closed = await prisma.cashSession.update({
      where: { id: data.sessionId },
      data: {
        status: "CLOSED",
        closedById: activeUser.id,
        closedAt: new Date(),
        countedAmount: Number(data.countedAmount),
        notes: data.notes || null,
      },
    });

    await logAuditAction(activeUser.id, "CLOSE_CASH_SESSION", "CashSession", data.sessionId, {
      countedAmount: data.countedAmount,
      expectedAmount,
      variance,
    });
    revalidatePath(`/dashboard/clinics/${session.organizationId}/caisse`);
    return { success: true, data: { session: closed, expectedAmount, variance } };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors de la fermeture de la caisse.") };
  }
}
