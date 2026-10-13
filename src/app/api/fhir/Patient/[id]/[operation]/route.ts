import { fhirBundle } from "@/lib/fhir";
import { auditFhirRead, fhirBaseUrl, fhirError, fhirJson, findClientPatient, patientDiagnosticReports, patientObservations, patientResource, withFhirClient } from "@/lib/fhir-server";

// Patient/<id>/$everything : le dossier exportable du patient en un seul Bundle.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; operation: string }> }) {
  return withFhirClient(req, async (client) => {
    const { id, operation } = await params;
    if (decodeURIComponent(operation) !== "$everything") return fhirError(404, "not-supported", `Opération ${operation} non prise en charge.`);
    const patient = await findClientPatient(client, id);
    if (!patient) return fhirError(404, "not-found", `Patient/${id} introuvable.`);
    const [observations, reports] = await Promise.all([patientObservations(id), patientDiagnosticReports(id)]);
    await auditFhirRead(client, "Patient/$everything", { patientId: id, observations: observations.length, reports: reports.length });
    return fhirJson(fhirBundle("searchset", [patientResource(patient), ...observations, ...reports], fhirBaseUrl(req)));
  });
}
