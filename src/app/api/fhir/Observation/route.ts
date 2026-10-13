import { fhirBundle } from "@/lib/fhir";
import { auditFhirRead, fhirBaseUrl, fhirError, fhirJson, findClientPatient, patientObservations, referenceId, withFhirClient } from "@/lib/fhir-server";

// Observation?patient=<id>[&category=vital-signs|laboratory] — constantes et résultats validés.
export async function GET(req: Request) {
  return withFhirClient(req, async (client) => {
    const params = new URL(req.url).searchParams;
    const patientId = referenceId(params.get("patient") ?? params.get("subject"));
    if (!patientId) return fhirError(400, "invalid", "Paramètre patient requis.");
    const category = params.get("category") ?? undefined;
    if (category && !["vital-signs", "laboratory"].includes(category)) return fhirJson(fhirBundle("searchset", [], fhirBaseUrl(req)));
    if (!(await findClientPatient(client, patientId))) return fhirError(404, "not-found", `Patient/${patientId} introuvable.`);
    const observations = await patientObservations(patientId, category);
    await auditFhirRead(client, "Observation?search", { patientId, category, count: observations.length });
    return fhirJson(fhirBundle("searchset", observations, fhirBaseUrl(req)));
  });
}
