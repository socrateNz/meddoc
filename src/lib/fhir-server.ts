import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicOrigin } from "@/lib/request-origin";
import { authenticateIntegration, type IntegrationClientRecord } from "@/lib/integration-auth";
import { logAuditAction } from "@/middlewares/auditLogger";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";
import { FHIR_CONTENT_TYPE, labDiagnosticReport, labResultObservation, operationOutcome, radiologyDiagnosticReport, toFhirPatient, vitalSignObservations } from "@/lib/fhir";

// Socle des routes FHIR : clé d'API (portée fhir:read), données limitées à la clinique de la
// clé, chaque lecture tracée dans le journal d'audit.
export function fhirJson(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), { status, headers: { "Content-Type": FHIR_CONTENT_TYPE, "Cache-Control": "no-store" } });
}

export function fhirError(status: number, code: Parameters<typeof operationOutcome>[0], message: string) {
  return fhirJson(operationOutcome(code, message), status);
}

export function fhirBaseUrl(req: Request) {
  return `${publicOrigin(req)}/api/fhir`;
}

export async function withFhirClient(req: Request, handler: (client: IntegrationClientRecord) => Promise<Response>): Promise<Response> {
  try {
    const limited = await rateLimitOrResponse(req, 300, 60000);
    if (limited) return limited;
    const auth = await authenticateIntegration(req, "fhir:read", (status, message) => fhirError(status, status === 401 ? "security" : "forbidden", message));
    if ("response" in auth) return auth.response;
    return await handler(auth.client);
  } catch (error) {
    console.error("Erreur FHIR:", error);
    return fhirError(500, "exception", "Erreur interne.");
  }
}

export async function auditFhirRead(client: IntegrationClientRecord, resource: string, details: Record<string, unknown>) {
  await logAuditAction(client.createdById, "FHIR_READ", "IntegrationClient", client.id, { client: client.name, resource, ...details });
}

const PATIENT_SELECT = {
  id: true,
  ipp: true,
  sex: true,
  dateOfBirth: true,
  address: true,
  organizationId: true,
  user: { select: { firstName: true, lastName: true, phone: true } },
} as const;

// Patient de la clinique de la clé, ou null (un patient d'une autre clinique est « introuvable »).
export async function findClientPatient(client: IntegrationClientRecord, patientId: string) {
  if (!/^[a-f0-9]{24}$/i.test(patientId)) return null;
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: PATIENT_SELECT });
  return patient && patient.organizationId === client.organizationId ? patient : null;
}

export async function searchClientPatients(client: IntegrationClientRecord, criteria: { id?: string; ipp?: string }) {
  if (criteria.id) {
    const p = await findClientPatient(client, criteria.id);
    return p ? [p] : [];
  }
  if (criteria.ipp) {
    return prisma.patient.findMany({ where: { organizationId: client.organizationId, ipp: criteria.ipp }, select: PATIENT_SELECT });
  }
  return [];
}

export function patientResource(p: NonNullable<Awaited<ReturnType<typeof findClientPatient>>>) {
  return toFhirPatient(p);
}

export async function patientObservations(patientId: string, category?: string) {
  const wantVitals = !category || category === "vital-signs";
  const wantLab = !category || category === "laboratory";
  const [vitals, orders] = await Promise.all([
    wantVitals ? prisma.vitalSign.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 200 }) : [],
    wantLab ? prisma.labOrder.findMany({ where: { patientId }, select: { id: true } }) : [],
  ]);
  const results = orders.length
    ? await prisma.labResult.findMany({ where: { labOrderId: { in: orders.map((o) => o.id) }, validatedAt: { not: null } }, orderBy: { createdAt: "desc" } })
    : [];
  return [
    ...vitals.flatMap((v) => vitalSignObservations(v)),
    ...results.map((r) => labResultObservation({ ...r, patientId, validatedAt: r.validatedAt! })),
  ];
}

export async function patientDiagnosticReports(patientId: string) {
  const [labOrders, radiology] = await Promise.all([
    prisma.labOrder.findMany({ where: { patientId, status: { in: ["VALIDATED", "DELIVERED"] } }, include: { results: { select: { id: true, validatedAt: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.radiologyOrder.findMany({ where: { patientId, status: "VALIDATED" }, orderBy: { createdAt: "desc" } }),
  ]);
  return [
    ...labOrders.map((o) =>
      labDiagnosticReport({ id: o.id, patientId, tests: o.tests, createdAt: o.createdAt, updatedAt: o.updatedAt, resultIds: o.results.filter((r) => r.validatedAt).map((r) => r.id) })
    ),
    ...radiology.map((o) =>
      radiologyDiagnosticReport({
        id: o.id,
        patientId,
        exams: (o.exams as unknown as { name: string }[]) || [],
        performedAt: o.performedAt,
        validatedAt: o.validatedAt ?? o.updatedAt,
        report: o.report,
        conclusion: o.conclusion,
      })
    ),
  ];
}

// « Patient/<id> » ou « <id> » → id.
export function referenceId(value: string | null): string | null {
  if (!value) return null;
  const id = value.replace(/^Patient\//, "");
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}
