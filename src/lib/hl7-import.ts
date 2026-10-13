import { prisma } from "@/lib/db";
import { labOrderReference } from "@/lib/lab-label";
import { computeLabOrderStatus, isCriticalValue } from "@/lib/lab-rules";
import { isAbnormalFlag, isImportableStatus, type OruMessage, type OruObservation } from "@/lib/hl7";
import type { IntegrationClientRecord } from "@/lib/integration-auth";

// Import des résultats d'un automate (ORU^R01) dans les demandes d'analyse de la clinique. Les
// résultats importés restent NON validés : la validation biologique (maker-checker) reste
// humaine, exactement comme pour une saisie manuelle.
const OPEN_LAB_STATUSES = ["PRESCRIBED", "SAMPLE_COLLECTED", "RECEIVED_AT_LAB", "IN_ANALYSIS", "TO_VALIDATE"];
const MAX_REFERENCE_SCAN = 2000;

export interface Hl7ImportReport {
  imported: number;
  updated: number;
  issues: string[];
  rejectedOrders: number;
}

type LabOrderRecord = NonNullable<Awaited<ReturnType<typeof prisma.labOrder.findUnique>>>;

// Demande désignée par son identifiant complet ou par la référence du tube (LAB-xxxxxxxx).
async function resolveLabOrder(identifier: string, organizationId: string): Promise<LabOrderRecord | null | "AMBIGUOUS"> {
  const value = identifier.trim();
  if (/^[a-f0-9]{24}$/i.test(value)) {
    const order = await prisma.labOrder.findUnique({ where: { id: value } });
    return order && order.organizationId === organizationId ? order : null;
  }
  const reference = value.toUpperCase();
  if (!/^LAB-[A-F0-9]{8}$/.test(reference)) return null;
  const candidates = await prisma.labOrder.findMany({
    where: { organizationId, status: { in: OPEN_LAB_STATUSES } },
    orderBy: { createdAt: "desc" },
    take: MAX_REFERENCE_SCAN,
  });
  const matches = candidates.filter((o) => labOrderReference(o.id) === reference);
  if (matches.length > 1) return "AMBIGUOUS";
  return matches[0] ?? null;
}

function matchTest(tests: string[], obs: OruObservation): string | null {
  const keys = [obs.text, obs.code].map((k) => k.trim().toLowerCase()).filter(Boolean);
  return tests.find((t) => keys.includes(t.trim().toLowerCase())) ?? null;
}

export async function importOruResults(message: OruMessage, client: IntegrationClientRecord): Promise<Hl7ImportReport> {
  const report: Hl7ImportReport = { imported: 0, updated: 0, issues: [], rejectedOrders: 0 };
  const criticalEvents: { labOrderId: string; labResultId: string; patientId: string; orderedById: string; organizationId: string | null; testName: string; value: string }[] = [];

  for (const oruOrder of message.orders) {
    const identifier = oruOrder.placerOrderNumber || oruOrder.fillerOrderNumber;
    const label = identifier || "(sans numéro)";
    const order = identifier ? await resolveLabOrder(identifier, client.organizationId) : null;
    if (order === "AMBIGUOUS") {
      report.rejectedOrders++;
      report.issues.push(`${label} : référence ambiguë, renvoyez l'identifiant complet de la demande.`);
      continue;
    }
    if (!order) {
      report.rejectedOrders++;
      report.issues.push(`${label} : demande d'analyse introuvable dans cette clinique.`);
      continue;
    }
    if (!OPEN_LAB_STATUSES.includes(order.status)) {
      report.rejectedOrders++;
      report.issues.push(`${label} : demande ${order.status === "CANCELLED" ? "annulée" : "déjà validée ou remise"}, résultats refusés.`);
      continue;
    }

    // Sécurité d'identité : le patient du message doit être celui de la demande (IPP ou
    // identifiant MedDoc).
    const patient = await prisma.patient.findUnique({ where: { id: order.patientId }, select: { id: true, ipp: true } });
    const known = [patient?.id, patient?.ipp].filter(Boolean).map((v) => String(v).toUpperCase());
    if (message.patientIdentifiers.length === 0 || !message.patientIdentifiers.some((id) => known.includes(id.toUpperCase()))) {
      report.rejectedOrders++;
      report.issues.push(`${label} : patient du message différent de celui de la demande — rien importé.`);
      continue;
    }

    const existing = await prisma.labResult.findMany({ where: { labOrderId: order.id } });
    let touched = false;
    for (const obs of oruOrder.observations) {
      const testName = matchTest(order.tests, obs);
      if (!testName) {
        report.issues.push(`${label} : analyse « ${obs.text || obs.code} » non demandée, ignorée.`);
        continue;
      }
      if (!isImportableStatus(obs.status)) continue;
      if (obs.value.trim() === "") {
        report.issues.push(`${label} : « ${testName} » sans valeur, ignoré.`);
        continue;
      }

      const catalogTest = await prisma.labTest.findFirst({
        where: { organizationId: client.organizationId, isActive: true, name: { equals: testName, mode: "insensitive" } },
      });
      const isCritical = isCriticalValue(catalogTest, obs.value);
      const data = {
        value: obs.value.trim(),
        unit: obs.unit || null,
        referenceRange: obs.referenceRange || (catalogTest?.criticalLow != null && catalogTest?.criticalHigh != null ? `${catalogTest.criticalLow} - ${catalogTest.criticalHigh}` : null),
        isAbnormal: isAbnormalFlag(obs.abnormalFlag) || isCritical,
        notes: [`Importé de l'automate « ${client.name} » (HL7)`, obs.comment].filter(Boolean).join(" — "),
      };

      const previous = existing.find((r) => r.testName === testName);
      if (previous) {
        // Un résultat validé est verrouillé ; un doublon non corrigé est ignoré ; une correction
        // (OBX-11 = C) remplace la valeur encore non validée.
        if (previous.validatedAt) {
          report.issues.push(`${label} : « ${testName} » déjà validé, correction refusée.`);
          continue;
        }
        if (obs.status !== "C") continue;
        await prisma.labResult.update({ where: { id: previous.id }, data });
        report.updated++;
        touched = true;
        if (isCritical) criticalEvents.push({ labOrderId: order.id, labResultId: previous.id, patientId: order.patientId, orderedById: order.orderedById, organizationId: order.organizationId, testName, value: data.value });
        continue;
      }

      const created = await prisma.labResult.create({ data: { labOrderId: order.id, testName, ...data, recordedById: client.createdById } });
      existing.push(created);
      report.imported++;
      touched = true;
      if (isCritical) criticalEvents.push({ labOrderId: order.id, labResultId: created.id, patientId: order.patientId, orderedById: order.orderedById, organizationId: order.organizationId, testName, value: data.value });
    }

    if (touched) {
      const nextStatus = computeLabOrderStatus({ status: order.status, tests: order.tests, results: existing });
      if (nextStatus !== order.status) await prisma.labOrder.update({ where: { id: order.id }, data: { status: nextStatus } });
    }
  }

  if (criticalEvents.length) {
    try {
      const { appEvents } = await import("@/lib/events");
      for (const event of criticalEvents) appEvents.emit("lab.result.critical", event);
    } catch (e) {
      console.error("Failed to emit lab.result.critical event:", e);
    }
  }
  return report;
}
