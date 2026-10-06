"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { toErrorMessage } from "@/lib/utils";
import { resolvePage } from "@/lib/pagination";
import { assertClinicScope } from "@/lib/clinic-scope";
import { ROUND_ROLES, ageFrom, canRunRound, cleanRoundText, isRoundDecision, isValidRoundDay, type RoundDecision } from "@/lib/rounds";

// Accès à la ronde : rôle soignant, et clinique du périmètre de l'utilisateur.
async function requireRoundUser(clinicId: string) {
  const activeUser = await getCurrentUser();
  if (!activeUser) throw new Error("Non authentifié.");
  if (!canRunRound(activeUser.role)) {
    throw new Error("Non autorisé. La ronde est réservée à l'équipe médicale.");
  }
  await assertClinicScope(clinicId, activeUser);
  return activeUser;
}

// Visite d'un patient : la ronde doit exister et être encore ouverte.
async function loadOpenEntry(entryId: string) {
  const entry = await prisma.roundEntry.findUnique({ where: { id: entryId }, include: { session: true } });
  if (!entry) throw new Error("Patient introuvable dans cette ronde.");
  const activeUser = await requireRoundUser(entry.session.organizationId);
  if (entry.session.status !== "OPEN") throw new Error("Cette ronde est clôturée.");
  return { entry, activeUser };
}

// Membres de l'équipe pouvant participer à la ronde (liste complète : c'est un sélecteur).
export async function getRoundTeam(clinicId: string) {
  try {
    await requireRoundUser(clinicId);
    const members = await prisma.user.findMany({
      where: { organizationId: clinicId, role: { in: [...ROUND_ROLES] }, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { lastName: "asc" },
    });
    return { success: true as const, data: members };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de l'équipe.") };
  }
}

// Services de la clinique, pour choisir la ronde à conduire.
export async function getRoundWards(clinicId: string) {
  try {
    await requireRoundUser(clinicId);
    const wards = await prisma.ward.findMany({
      where: { organizationId: clinicId },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    return { success: true as const, data: wards };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement des services.") };
  }
}

// Démarre la ronde d'un service pour un jour : une entrée par patient hospitalisé, dans l'ordre des
// chambres puis des lits. Une seule ronde par service et par jour : une seconde demande (double clic)
// renvoie la ronde existante au lieu d'en créer une autre.
export async function startRound(clinicId: string, wardId: string, day: string, participantIds: string[] = []) {
  try {
    if (!isValidRoundDay(day)) throw new Error("Date de ronde invalide.");
    const activeUser = await requireRoundUser(clinicId);

    const ward = await prisma.ward.findFirst({ where: { id: wardId, organizationId: clinicId }, select: { id: true } });
    if (!ward) throw new Error("Service introuvable dans cette clinique.");

    const existing = await prisma.roundSession.findUnique({ where: { wardId_day: { wardId, day } }, select: { id: true } });
    if (existing) return { success: true as const, data: { id: existing.id, created: false } };

    // Présents choisis dans le formulaire : seuls les membres de la clinique sont retenus.
    const members = participantIds.length
      ? await prisma.user.findMany({ where: { id: { in: participantIds }, organizationId: clinicId }, select: { id: true } })
      : [];
    const presentIds = members.length ? members.map((m) => m.id) : [activeUser.id];

    const hospitalized = await prisma.patient.findMany({
      where: { bed: { is: { wardId } } },
      select: { id: true, bed: { select: { label: true, room: { select: { name: true } } } } },
    });
    const ordered = hospitalized
      .map((p) => ({
        patientId: p.id,
        roomName: p.bed?.room.name ?? "",
        bedLabel: p.bed?.label ?? "",
      }))
      .sort(
        (a, b) =>
          a.roomName.localeCompare(b.roomName, "fr", { numeric: true }) || a.bedLabel.localeCompare(b.bedLabel, "fr", { numeric: true })
      );

    try {
      const session = await prisma.roundSession.create({
        data: {
          organizationId: clinicId,
          wardId,
          day,
          startedById: activeUser.id,
          participantIds: presentIds,
          entries: {
            create: ordered.map((p, index) => ({
              patientId: p.patientId,
              bedLabel: p.bedLabel ? `${p.roomName} · Lit ${p.bedLabel}` : p.roomName,
              roomName: p.roomName || null,
              bedNumber: p.bedLabel || null,
              position: index + 1,
            })),
          },
        },
        select: { id: true },
      });
      await logAuditAction(activeUser.id, "START_ROUND", "RoundSession", session.id, { wardId, day });
      return { success: true as const, data: { id: session.id, created: true } };
    } catch (error) {
      // Contrainte unique [wardId, day] : une autre requête vient de créer la ronde.
      if ((error as { code?: string })?.code === "P2002") {
        const again = await prisma.roundSession.findUnique({ where: { wardId_day: { wardId, day } }, select: { id: true } });
        if (again) return { success: true as const, data: { id: again.id, created: false } };
      }
      throw error;
    }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du démarrage de la ronde.") };
  }
}

// Libellé du lit tel qu'il apparaît sur l'entrée de ronde.
function formatBedLabel(roomName: string, bedLabel: string): string {
  return bedLabel ? `${roomName} · Lit ${bedLabel}` : roomName;
}

// Met la ronde ouverte à jour avec l'état actuel du service : un patient admis depuis le démarrage
// entre à la fin de la liste ; un patient encore à voir qui a quitté le service est signalé comme passé,
// pour ne pas bloquer la clôture. Les patients déjà vus ne sont jamais modifiés.
async function syncRoundEntries(sessionId: string, wardId: string) {
  const [hospitalized, entries] = await Promise.all([
    prisma.patient.findMany({
      where: { bed: { is: { wardId } } },
      select: { id: true, bed: { select: { label: true, room: { select: { name: true } } } } },
    }),
    prisma.roundEntry.findMany({
      where: { sessionId },
      select: { id: true, patientId: true, position: true, status: true },
    }),
  ]);

  const known = new Set(entries.map((e) => e.patientId));
  const present = new Set(hospitalized.map((p) => p.id));

  const admitted = hospitalized
    .filter((p) => !known.has(p.id))
    .map((p) => ({ id: p.id, roomName: p.bed?.room.name ?? "", bedLabel: p.bed?.label ?? "" }))
    .sort(
      (a, b) =>
        a.roomName.localeCompare(b.roomName, "fr", { numeric: true }) || a.bedLabel.localeCompare(b.bedLabel, "fr", { numeric: true })
    );

  let position = Math.max(0, ...entries.map((e) => e.position)) + 1;
  for (const p of admitted) {
    try {
      await prisma.roundEntry.create({
        data: {
          sessionId,
          patientId: p.id,
          bedLabel: formatBedLabel(p.roomName, p.bedLabel),
          roomName: p.roomName || null,
          bedNumber: p.bedLabel || null,
          position: position++,
        },
      });
    } catch (error) {
      // Un autre appel vient d'ajouter ce patient (contrainte unique [sessionId, patientId]).
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
  }

  const left = entries.filter((e) => e.status === "PENDING" && !present.has(e.patientId));
  if (left.length > 0) {
    await prisma.roundEntry.updateMany({
      where: { id: { in: left.map((e) => e.id) } },
      data: {
        status: "SKIPPED",
        observations: "Plus hospitalisé dans ce service pendant la ronde.",
        visitedAt: new Date(),
      },
    });
  }
}

// Ronde d'un service pour un jour, avec les compteurs et une page de patients (20 au plus), chacun
// accompagné de son point clinique : dernières constantes, tâches de soins en attente, analyses en
// cours, incidents ouverts.
export async function getRound(clinicId: string, wardId: string, day: string, options?: { page?: number; pageSize?: number }) {
  try {
    if (!isValidRoundDay(day)) throw new Error("Date de ronde invalide.");
    await requireRoundUser(clinicId);

    const session = await prisma.roundSession.findUnique({
      where: { wardId_day: { wardId, day } },
      select: { id: true, organizationId: true, status: true, day: true, participantIds: true, closedAt: true },
    });
    if (!session || session.organizationId !== clinicId) {
      return { success: true as const, data: null };
    }
    // Tant que la ronde est ouverte, elle suit le service : admissions et sorties sont prises en compte.
    if (session.status === "OPEN") await syncRoundEntries(session.id, wardId);

    const { page, pageSize, skip, take } = resolvePage(options);
    const [entries, grouped, total] = await Promise.all([
      prisma.roundEntry.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
        skip,
        take,
        include: { visitedBy: { select: { firstName: true, lastName: true } } },
      }),
      prisma.roundEntry.groupBy({ by: ["status"], where: { sessionId: session.id }, _count: { _all: true } }),
      prisma.roundEntry.count({ where: { sessionId: session.id } }),
    ]);

    const counts = { total, pending: 0, visited: 0, skipped: 0 };
    for (const g of grouped) {
      if (g.status === "PENDING") counts.pending = g._count._all;
      if (g.status === "VISITED") counts.visited = g._count._all;
      if (g.status === "SKIPPED") counts.skipped = g._count._all;
    }

    const patients = await prisma.patient.findMany({
      where: { id: { in: entries.map((e) => e.patientId) } },
      select: {
        id: true,
        dateOfBirth: true,
        dependencyLevel: true,
        allergies: true,
        status: true,
        user: { select: { firstName: true, lastName: true } },
        vitalSigns: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, temperature: true, bloodPressure: true, heartRate: true, oxygenSaturation: true },
        },
        carePlans: { where: { status: "ACTIVE" }, select: { tasks: { where: { status: "PENDING" }, select: { id: true } } } },
        labOrders: { where: { status: { notIn: ["DELIVERED", "CANCELLED"] } }, select: { id: true } },
        incidents: { where: { status: "OPEN" }, select: { id: true } },
      },
    });
    const byId = new Map(patients.map((p) => [p.id, p]));

    const rows = entries.map((entry) => {
      const p = byId.get(entry.patientId);
      return {
        ...entry,
        patient: p
          ? {
              id: p.id,
              firstName: p.user.firstName,
              lastName: p.user.lastName,
              age: ageFrom(p.dateOfBirth),
              dependencyLevel: p.dependencyLevel,
              allergies: p.allergies,
              status: p.status,
              lastVitals: p.vitalSigns[0] ?? null,
              pendingTasks: p.carePlans.reduce((sum, cp) => sum + cp.tasks.length, 0),
              pendingLabs: p.labOrders.length,
              openIncidents: p.incidents.length,
            }
          : null,
      };
    });

    return {
      success: true as const,
      data: {
        session: { id: session.id, status: session.status, day: session.day, participantIds: session.participantIds, closedAt: session.closedAt },
        counts,
        entries: rows,
        page,
        pageSize,
        total,
      },
    };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du chargement de la ronde.") };
  }
}

// Présents à la ronde : la liste remplace les participants actuels (membres de la clinique seulement).
export async function setRoundParticipants(sessionId: string, userIds: string[]) {
  try {
    const session = await prisma.roundSession.findUnique({ where: { id: sessionId }, select: { id: true, organizationId: true, status: true } });
    if (!session) throw new Error("Ronde introuvable.");
    await requireRoundUser(session.organizationId);
    if (session.status !== "OPEN") throw new Error("Cette ronde est clôturée.");

    const members = await prisma.user.findMany({
      where: { id: { in: userIds }, organizationId: session.organizationId },
      select: { id: true },
    });
    await prisma.roundSession.update({ where: { id: sessionId }, data: { participantIds: members.map((m) => m.id) } });
    return { success: true as const, data: { participantIds: members.map((m) => m.id) } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la mise à jour des présents.") };
  }
}

// Visite d'un patient : constats, décision et conduite à tenir. Peut être reprise tant que la ronde est ouverte.
export async function recordRoundVisit(entryId: string, input: { observations?: string; decision?: string; plan?: string }) {
  try {
    if (input.decision !== undefined && input.decision !== "" && !isRoundDecision(input.decision)) {
      throw new Error("Décision inconnue.");
    }
    const decision: RoundDecision | null = isRoundDecision(input.decision) ? input.decision : null;
    const { entry, activeUser } = await loadOpenEntry(entryId);

    const updated = await prisma.roundEntry.update({
      where: { id: entry.id },
      data: {
        status: "VISITED",
        observations: cleanRoundText(input.observations),
        decision,
        plan: cleanRoundText(input.plan),
        visitedAt: new Date(),
        visitedById: activeUser.id,
      },
    });
    await logAuditAction(activeUser.id, "RECORD_ROUND_VISIT", "RoundEntry", entry.id, { decision });
    return { success: true as const, data: updated };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de l'enregistrement de la visite.") };
  }
}

// Patient passé sans être vu (absent, en examen, etc.) : le motif est obligatoire.
export async function skipRoundEntry(entryId: string, reason: string) {
  try {
    const motive = cleanRoundText(reason);
    if (!motive) throw new Error("Indiquez le motif du passage.");
    const { entry, activeUser } = await loadOpenEntry(entryId);

    const updated = await prisma.roundEntry.update({
      where: { id: entry.id },
      data: { status: "SKIPPED", observations: motive, decision: null, visitedAt: new Date(), visitedById: activeUser.id },
    });
    await logAuditAction(activeUser.id, "SKIP_ROUND_ENTRY", "RoundEntry", entry.id);
    return { success: true as const, data: updated };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors du passage du patient.") };
  }
}

// Clôture de la ronde. Les patients non vus restent visibles dans le résumé (le nombre est renvoyé).
export async function closeRound(sessionId: string) {
  try {
    const session = await prisma.roundSession.findUnique({ where: { id: sessionId }, select: { id: true, organizationId: true, status: true } });
    if (!session) throw new Error("Ronde introuvable.");
    const activeUser = await requireRoundUser(session.organizationId);
    if (session.status !== "OPEN") throw new Error("Cette ronde est déjà clôturée.");

    const pending = await prisma.roundEntry.count({ where: { sessionId, status: "PENDING" } });
    await prisma.roundSession.update({
      where: { id: sessionId },
      data: { status: "CLOSED", closedAt: new Date(), closedById: activeUser.id },
    });
    await logAuditAction(activeUser.id, "CLOSE_ROUND", "RoundSession", sessionId, { pending });
    return { success: true as const, data: { pending } };
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error, "Erreur lors de la clôture de la ronde.") };
  }
}
