import { authenticateIntegration } from "@/lib/integration-auth";
import { buildAck, parseOruR01 } from "@/lib/hl7";
import { importOruResults } from "@/lib/hl7-import";
import { logAuditAction } from "@/middlewares/auditLogger";
import { rateLimitOrResponse } from "@/middlewares/rateLimiter";

// Réception des résultats d'un automate de laboratoire (HL7 v2 ORU^R01, codage ER7) — clé d'API
// de portée hl7:lab. Répond toujours par un message ACK HL7 (AA accepté, AE erreur, AR rejet).
const HL7_CONTENT_TYPE = "x-application/hl7-v2+er7; charset=utf-8";
const MAX_MESSAGE_BYTES = 512 * 1024;

const EMPTY_HEADER = { controlId: "", sendingApplication: "", sendingFacility: "", receivingApplication: "MEDDOC", receivingFacility: "", version: "2.5" };

function hl7Response(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": HL7_CONTENT_TYPE, "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const limited = await rateLimitOrResponse(req, 600, 60000);
  if (limited) return limited;
  const auth = await authenticateIntegration(req, "hl7:lab", (status, message) => hl7Response(buildAck({ original: EMPTY_HEADER, code: "AR", text: message }), status));
  if ("response" in auth) return auth.response;
  const { client } = auth;

  const body = await req.text();
  if (body.length > MAX_MESSAGE_BYTES) return hl7Response(buildAck({ original: EMPTY_HEADER, code: "AR", text: "Message trop volumineux." }), 413);

  let message;
  try {
    message = parseOruR01(body);
  } catch (error) {
    return hl7Response(buildAck({ original: EMPTY_HEADER, code: "AR", text: error instanceof Error ? error.message : "Message illisible." }), 400);
  }

  try {
    const report = await importOruResults(message, client);
    const ok = report.rejectedOrders === 0 && report.imported + report.updated > 0;
    const summary = `${report.imported} résultat(s) importé(s), ${report.updated} corrigé(s)${report.issues.length ? ` — ${report.issues.join(" ; ")}` : ""}`;
    await logAuditAction(client.createdById, "HL7_ORU_IMPORT", "IntegrationClient", client.id, {
      client: client.name,
      controlId: message.controlId,
      imported: report.imported,
      updated: report.updated,
      rejectedOrders: report.rejectedOrders,
      issues: report.issues,
    });
    return hl7Response(buildAck({ original: message, code: ok ? "AA" : "AE", text: summary.slice(0, 1000) }));
  } catch (error) {
    console.error("Erreur d'import HL7:", error);
    return hl7Response(buildAck({ original: message, code: "AE", text: "Erreur interne lors de l'import." }), 500);
  }
}
