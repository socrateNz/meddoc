import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateIntegration } from "@/lib/integration-auth";
import { buildOrmO01, hl7Timestamp } from "@/lib/hl7";
import { labOrderReference } from "@/lib/lab-label";
import { logAuditAction } from "@/middlewares/auditLogger";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";

// Liste de travail de l'automate : une demande ORM^O01 par échantillon prélevé et pas encore
// analysé (7 derniers jours). Le numéro de demande est celui du code-barres du tube (LAB-…),
// que l'automate renvoie avec ses résultats.
const WORKLIST_STATUSES = ["SAMPLE_COLLECTED", "RECEIVED_AT_LAB", "IN_ANALYSIS"];

export async function GET(req: Request) {
  const limited = await rateLimitOrResponse(req, 120, 60000);
  if (limited) return limited;
  const auth = await authenticateIntegration(req, "hl7:lab");
  if ("response" in auth) return auth.response;
  const { client } = auth;

  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [orders, organization] = await Promise.all([
      prisma.labOrder.findMany({
        where: { organizationId: client.organizationId, status: { in: WORKLIST_STATUSES }, createdAt: { gte: since } },
        include: { patient: { select: { id: true, ipp: true, sex: true, dateOfBirth: true, user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      prisma.organization.findUnique({ where: { id: client.organizationId }, select: { name: true } }),
    ]);
    const now = new Date();
    const messages = orders.map((o, i) => ({
      orderId: o.id,
      reference: labOrderReference(o.id),
      message: buildOrmO01({
        controlId: `ORM${hl7Timestamp(now)}${String(i + 1).padStart(4, "0")}`,
        facility: organization?.name ?? "",
        now,
        patient: { id: o.patient.id, ipp: o.patient.ipp, lastName: o.patient.user.lastName, firstName: o.patient.user.firstName, dateOfBirth: o.patient.dateOfBirth, sex: o.patient.sex },
        order: { reference: labOrderReference(o.id), tests: o.tests, priority: o.priority, orderedAt: o.createdAt, sampleCollectedAt: o.sampleCollectedAt, sampleType: o.sampleType },
      }),
    }));
    await logAuditAction(client.createdById, "HL7_WORKLIST", "IntegrationClient", client.id, { client: client.name, count: messages.length });
    return NextResponse.json({ generatedAt: now.toISOString(), messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erreur de liste de travail HL7:", error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
}
