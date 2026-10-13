"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toErrorMessage } from "@/lib/utils";
import { MAX_PAGE_SIZE, resolvePage } from "@/lib/pagination";
import { logAuditAction } from "@/middlewares/auditLogger";
import { createHoldingSchema, updateHoldingSubscriptionSchema } from "@/validators/super-admin";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { Role, SubscriptionPlan, SubscriptionStatus, PaymentFrequency, PaymentPlan } from "@prisma/client";
import { z } from "zod";
import { MODULE_KEYS, PLAN_MODULES, disabledModulesFor, enabledModulesFrom, withRequirements, type ModuleKey } from "@/lib/modules";

export async function getHoldings(options?: { page?: number; pageSize?: number }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const { page, pageSize, skip, take } = resolvePage(options);
    const [rawHoldings, total] = await Promise.all([
      prisma.organization.findMany({
        where: {
          type: "HOLDING"
        },
        include: {
          _count: {
            select: { children: true }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        skip,
        take,
      }),
      prisma.organization.count({ where: { type: "HOLDING" } }),
    ]);

    const holdings = await Promise.all(
      rawHoldings.map(async (holding) => {
        const [usersCount, patientsCount, adminUser] = await Promise.all([
          prisma.user.count({
            where: {
              OR: [
                { organizationId: holding.id },
                { organization: { parentId: holding.id } }
              ]
            }
          }),
          prisma.patient.count({
            where: {
              OR: [
                { organizationId: holding.id },
                { organization: { parentId: holding.id } }
              ]
            }
          }),
          // Premier administrateur de la holding — affiché sur la fiche détaillée et sur le
          // reçu/facture téléchargeable (cf. holding-actions-menu.tsx).
          prisma.user.findFirst({
            where: { organizationId: holding.id, role: "ADMIN" },
            orderBy: { createdAt: "asc" },
            select: { firstName: true, lastName: true, email: true },
          }),
        ]);

        return {
          ...holding,
          adminUser,
          _count: {
            children: holding._count.children,
            users: usersCount,
            patients: patientsCount
          }
        };
      })
    );

    return { holdings, error: null, total, page, pageSize };
  } catch (error: any) {
    console.error("Error fetching holdings:", error);
    return { holdings: [], error: error.message || "Failed to fetch holdings", total: 0, page: 1, pageSize: MAX_PAGE_SIZE };
  }
}

export async function createHolding(data: {
  name: string;
  plan: SubscriptionPlan;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  licenseExpiresAt?: Date | null;
  paymentAmount?: number | null;
  paymentFrequency?: PaymentFrequency | null;
  paymentPlan?: PaymentPlan;
  installmentsCount?: number | null;
  nextPaymentDate?: Date | null;
}) {
  try {
    createHoldingSchema.parse(data);
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.adminEmail }
    });

    if (existingUser) {
      throw new Error("Un utilisateur avec cet email existe déjà.");
    }

    const holding = await prisma.$transaction(async (tx) => {
      // 1. Create the holding
      const newHolding = await tx.organization.create({
        data: {
          name: data.name,
          type: "HOLDING",
          plan: data.plan,
          subscriptionStatus: "TRIALING",
          // Modules de la licence préréglés par le plan (ajustables ensuite, cf. updateHoldingModules).
          disabledModules: disabledModulesFor(PLAN_MODULES[data.plan] ?? [...MODULE_KEYS]),
          licenseExpiresAt: data.licenseExpiresAt,
          paymentAmount: data.paymentAmount ?? null,
          paymentFrequency: data.paymentFrequency ?? null,
          paymentPlan: data.paymentPlan ?? "FULL",
          installmentsCount: data.paymentPlan === "INSTALLMENTS" ? data.installmentsCount ?? null : null,
          nextPaymentDate: data.nextPaymentDate ?? null,
        }
      });

      // 2. Create the first admin for this holding
      const hashedPassword = await bcrypt.hash("admin123", 10);
      
      await tx.user.create({
        data: {
          email: data.adminEmail,
          passwordHash: hashedPassword,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: Role.ADMIN,
          organizationId: newHolding.id,
          isActive: true,
          requiresPasswordChange: true,
        }
      });

      return newHolding;
    });

    revalidatePath("/dashboard/holdings");
    return { holding, error: null };
  } catch (error: any) {
    console.error("Error creating holding:", error);
    return { holding: null, error: toErrorMessage(error, "Failed to create holding") };
  }
}

export async function updateHoldingSubscription(holdingId: string, data: {
  name: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  licenseExpiresAt?: Date | null;
  paymentAmount?: number | null;
  paymentFrequency?: PaymentFrequency | null;
  maxClinics: number;
  maxUsers: number;
  paymentPlan: PaymentPlan;
  installmentsCount?: number | null;
  nextPaymentDate?: Date | null;
}) {
  try {
    updateHoldingSubscriptionSchema.parse({ holdingId, ...data });
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const holding = await prisma.organization.update({
      where: { id: holdingId },
      data: {
        name: data.name,
        plan: data.plan,
        subscriptionStatus: data.status,
        licenseExpiresAt: data.licenseExpiresAt,
        paymentAmount: data.paymentAmount ?? null,
        paymentFrequency: data.paymentFrequency ?? null,
        maxClinics: data.maxClinics,
        maxUsers: data.maxUsers,
        paymentPlan: data.paymentPlan,
        installmentsCount: data.paymentPlan === "INSTALLMENTS" ? data.installmentsCount ?? null : null,
        nextPaymentDate: data.nextPaymentDate ?? null,
      }
    });

    await logAuditAction(user.id, "UPDATE_HOLDING", "Organization", holdingId, { name: data.name, plan: data.plan, status: data.status });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Failed to update holding") };
  }
}

// Suspend l'accès d'une holding sans rien supprimer — réversible via reactivateHolding.
// Équivalent rapide (un clic) à changer le statut vers INACTIVE depuis "Modifier l'abonnement".
export async function deactivateHolding(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.update({
      where: { id: holdingId, type: "HOLDING" },
      data: { subscriptionStatus: "INACTIVE" },
    });

    await logAuditAction(user.id, "DEACTIVATE_HOLDING", "Organization", holdingId, { name: holding.name });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Erreur lors de la désactivation.") };
  }
}

export async function reactivateHolding(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.update({
      where: { id: holdingId, type: "HOLDING" },
      data: { subscriptionStatus: "ACTIVE" },
    });

    await logAuditAction(user.id, "REACTIVATE_HOLDING", "Organization", holdingId, { name: holding.name });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { holding, error: null };
  } catch (error: any) {
    return { holding: null, error: toErrorMessage(error, "Erreur lors de la réactivation.") };
  }
}

// Suppression définitive — irréversible, contrairement à deactivateHolding. Bloquée tant que la
// holding a encore des cliniques rattachées : au-delà de ce garde-fou, la suppression en cascade
// entraînerait la perte de patients, dossiers médicaux et mouvements financiers réels. Une fois
// ce garde-fou passé, seule la holding elle-même et ses utilisateurs directement rattachés
// (généralement son seul administrateur) sont supprimés.
export async function deleteHolding(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.findFirst({
      where: { id: holdingId, type: "HOLDING" },
      include: { _count: { select: { children: true } } },
    });
    if (!holding) throw new Error("Holding introuvable.");
    if (holding._count.children > 0) {
      throw new Error(
        "Impossible de supprimer : cette holding possède encore des cliniques rattachées. Retirez-les d'abord."
      );
    }

    await prisma.$transaction([
      prisma.user.deleteMany({ where: { organizationId: holdingId } }),
      prisma.organization.delete({ where: { id: holdingId } }),
    ]);

    await logAuditAction(user.id, "DELETE_HOLDING", "Organization", holdingId, { name: holding.name });
    revalidatePath("/dashboard/holdings");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (error: any) {
    return { error: toErrorMessage(error, "Erreur lors de la suppression.") };
  }
}

// Réinitialise le mot de passe du premier administrateur de la holding — même mot de passe par
// défaut que createHolding ("admin123") et même mécanique que resetTeamMemberPassword côté
// coordinateur : requiresPasswordChange force le changement à la prochaine connexion (déjà géré
// par login/page.tsx et dashboard/layout.tsx, rien à ajouter côté flux de connexion).
export async function resetHoldingAdminPassword(holdingId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const holding = await prisma.organization.findFirst({ where: { id: holdingId, type: "HOLDING" } });
    if (!holding) throw new Error("Holding introuvable.");

    const admin = await prisma.user.findFirst({
      where: { organizationId: holdingId, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) throw new Error("Aucun administrateur trouvé pour cette holding.");

    const defaultPassword = "admin123";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash, requiresPasswordChange: true },
    });

    await logAuditAction(user.id, "RESET_HOLDING_ADMIN_PASSWORD", "User", admin.id, { holdingId, holdingName: holding.name });
    revalidatePath("/dashboard/holdings");

    return { error: null, data: { email: admin.email, defaultPassword } };
  } catch (error: any) {
    return { error: toErrorMessage(error, "Erreur lors de la réinitialisation du mot de passe."), data: null };
  }
}

export async function getSuperAdminOverview() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [allHoldingsForRevenue, planGroups, watchExpiring, watchInactive, recentHoldings, recentContactMessages] = await Promise.all([
      // Somme brute du coût de licence de TOUTES les holdings (peu importe le statut d'abonnement
      // ou la fréquence de paiement) — remplace l'ancien MRR (revenu mensuel récurrent, réservé aux
      // holdings ACTIVE et normalisé par mois) par un total cumulé plus simple, tel que demandé.
      prisma.organization.aggregate({
        where: { type: "HOLDING", paymentAmount: { not: null } },
        _sum: { paymentAmount: true },
      }),
      prisma.organization.groupBy({
        by: ["plan"],
        where: { type: "HOLDING" },
        _count: { _all: true },
      }),
      prisma.organization.findMany({
        // MongoDB trie `null` avant toute date : sans `not: null` explicite,
        // `lte` remonte aussi les holdings à licence illimitée.
        where: { type: "HOLDING", licenseExpiresAt: { not: null, lte: in30Days } },
        select: { id: true, name: true, licenseExpiresAt: true, subscriptionStatus: true },
        orderBy: { licenseExpiresAt: "asc" },
        take: MAX_PAGE_SIZE,
      }),
      prisma.organization.findMany({
        where: { type: "HOLDING", subscriptionStatus: { in: ["INACTIVE", "CANCELLED"] } },
        select: { id: true, name: true, licenseExpiresAt: true, subscriptionStatus: true },
        take: MAX_PAGE_SIZE,
      }),
      prisma.organization.findMany({
        where: { type: "HOLDING" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, plan: true, createdAt: true },
      }),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const totalRevenue = allHoldingsForRevenue._sum.paymentAmount ?? 0;

    const planBreakdown = planGroups.map((g) => ({ plan: g.plan, count: g._count._all }));

    // Fusionne les deux listes de surveillance (licence proche + abonnement inactif),
    // dédupliquées par holding, avec la ou les raisons associées.
    const watchMap = new Map<string, { id: string; name: string; licenseExpiresAt: Date | null; subscriptionStatus: string; reasons: string[] }>();
    for (const h of watchExpiring) {
      watchMap.set(h.id, { ...h, reasons: ["EXPIRING"] });
    }
    for (const h of watchInactive) {
      const existing = watchMap.get(h.id);
      if (existing) {
        existing.reasons.push("INACTIVE");
      } else {
        watchMap.set(h.id, { ...h, reasons: ["INACTIVE"] });
      }
    }

    return {
      success: true,
      data: {
        totalRevenue,
        planBreakdown,
        holdingsToWatch: Array.from(watchMap.values()),
        recentHoldings,
        recentContactMessages,
      },
    };
  } catch (error: any) {
    return { success: false, error: toErrorMessage(error, "Erreur lors du chargement de la vue d'ensemble.") };
  }
}

// --- Modules de la licence (cf. src/lib/modules.ts, Audit/ANALYSE_MODULES_LICENCE.md) ---

// Travail en cours dans les cliniques de la holding qui rend la désactivation d'un module
// dangereuse : bloquante (séjours facturés à la nuitée, transfusion en cours) ou à confirmer.
async function moduleDeactivationImpact(organizationIds: string[], modules: ModuleKey[]) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const inOrgs = { organizationId: { in: organizationIds } };
  for (const key of modules) {
    if (key === "HOSPITALISATION") {
      const open = await prisma.hospitalStay.count({ where: { ...inOrgs, status: "OPEN" } });
      if (open) blockers.push(`${open} séjour(s) d'hospitalisation en cours : clôturez-les (sortie) avant de retirer le module.`);
    } else if (key === "BANQUE_SANG") {
      const [running, reserved] = await Promise.all([
        prisma.transfusion.count({ where: { ...inOrgs, status: "IN_PROGRESS" } }),
        prisma.transfusion.count({ where: { ...inOrgs, status: "RESERVED" } }),
      ]);
      if (running) blockers.push(`${running} transfusion(s) en cours.`);
      if (reserved) warnings.push(`${reserved} poche(s) réservée(s) pour des patients.`);
    } else if (key === "BLOC") {
      const n = await prisma.surgeryCase.count({ where: { ...inOrgs, status: { in: ["SCHEDULED", "IN_PROGRESS"] } } });
      if (n) warnings.push(`${n} intervention(s) programmée(s) ou en cours au bloc.`);
    } else if (key === "LABORATOIRE") {
      const n = await prisma.labOrder.count({ where: { ...inOrgs, status: { notIn: ["VALIDATED", "DELIVERED", "CANCELLED"] } } });
      if (n) warnings.push(`${n} demande(s) d'analyse non terminée(s).`);
    } else if (key === "IMAGERIE") {
      const n = await prisma.radiologyOrder.count({ where: { ...inOrgs, status: { in: ["PRESCRIBED", "PERFORMED", "REPORTED"] } } });
      if (n) warnings.push(`${n} examen(s) d'imagerie non validé(s).`);
    }
  }
  return { blockers, warnings };
}

const modulesSchema = z.object({
  holdingId: z.string().min(1),
  enabledModules: z.array(z.enum(MODULE_KEYS)),
  confirm: z.boolean().optional(),
});

// Seul le SUPER_ADMIN choisit les modules d'une holding. Les prérequis sont ajoutés d'office
// (URGENCES entraîne ACCUEIL). Une désactivation avec du travail en cours est refusée (bloquant)
// ou demande une confirmation explicite (avertissements renvoyés sans rien enregistrer).
export async function updateHoldingModules(data: z.input<typeof modulesSchema>) {
  try {
    const input = modulesSchema.parse(data);
    const user = await getCurrentUser();
    if (!user || user.role !== "SUPER_ADMIN") throw new Error("Non autorisé.");

    const holding = await prisma.organization.findUnique({
      where: { id: input.holdingId },
      select: { id: true, type: true, name: true, disabledModules: true, children: { select: { id: true } } },
    });
    if (!holding || holding.type !== "HOLDING") throw new Error("Holding introuvable.");

    const before = enabledModulesFrom(holding.disabledModules);
    const after = withRequirements(input.enabledModules);
    const removed = before.filter((k) => !after.includes(k));
    const { blockers, warnings } = await moduleDeactivationImpact([holding.id, ...holding.children.map((c) => c.id)], removed);
    if (blockers.length) throw new Error(`Désactivation impossible — ${blockers.join(" ")}`);
    if (warnings.length && !input.confirm) {
      return { success: false as const, needsConfirmation: true as const, warnings };
    }

    const disabledModules = disabledModulesFor(after);
    await prisma.organization.update({ where: { id: holding.id }, data: { disabledModules } });
    await logAuditAction(user.id, "UPDATE_HOLDING_MODULES", "Organization", holding.id, {
      name: holding.name,
      enabled: after,
      removed,
      added: after.filter((k) => !before.includes(k)),
      warnings,
    });
    revalidatePath("/dashboard/holdings");
    return { success: true as const, data: { enabledModules: after } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la mise à jour des modules.") };
  }
}
