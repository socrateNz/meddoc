import { fhirBundle } from "@/lib/fhir";
import { auditFhirRead, fhirBaseUrl, fhirError, fhirJson, findClientPatient, patientDiagnosticReports, referenceId, withFhirClient } from "@/lib/fhir-server";

// DiagnosticReport?patient=<id> — comptes-rendus validés de laboratoire et d'imagerie.
export async function GET(req: Request) {
  return withFhirClient(req, async (client) => {
    const params = new URL(req.url).searchParams;
    const patientId = referenceId(params.get("patient") ?? params.get("subject"));
    if (!patientId) return fhirError(400, "invalid", "Paramètre patient requis.");
    if (!(await findClientPatient(client, patientId))) return fhirError(404, "not-found", `Patient/${patientId} introuvable.`);
    const reports = await patientDiagnosticReports(patientId);
    await auditFhirRead(client, "DiagnosticReport?search", { patientId, count: reports.length });
    return fhirJson(fhirBundle("searchset", reports, fhirBaseUrl(req)));
  });
}
