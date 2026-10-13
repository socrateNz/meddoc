import { auditFhirRead, fhirError, fhirJson, findClientPatient, patientResource, withFhirClient } from "@/lib/fhir-server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFhirClient(req, async (client) => {
    const { id } = await params;
    const patient = await findClientPatient(client, id);
    if (!patient) return fhirError(404, "not-found", `Patient/${id} introuvable.`);
    await auditFhirRead(client, "Patient", { patientId: id });
    return fhirJson(patientResource(patient));
  });
}
