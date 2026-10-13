import { fhirBundle, IPP_SYSTEM } from "@/lib/fhir";
import { auditFhirRead, fhirBaseUrl, fhirError, fhirJson, patientResource, searchClientPatients, withFhirClient } from "@/lib/fhir-server";

// Recherche de patients de la clinique : ?identifier=[<système>|]<IPP> ou ?_id=<id>.
export async function GET(req: Request) {
  return withFhirClient(req, async (client) => {
    const params = new URL(req.url).searchParams;
    const identifier = params.get("identifier");
    const id = params.get("_id") ?? undefined;
    let ipp: string | undefined;
    if (identifier) {
      const [system, value] = identifier.includes("|") ? identifier.split("|", 2) : ["", identifier];
      if (system && system !== IPP_SYSTEM) return fhirJson(fhirBundle("searchset", [], fhirBaseUrl(req)));
      ipp = value.trim();
    }
    if (!ipp && !id) return fhirError(400, "invalid", "Paramètre de recherche requis : identifier ou _id.");
    const patients = await searchClientPatients(client, { id, ipp });
    await auditFhirRead(client, "Patient?search", { identifier, id, count: patients.length });
    return fhirJson(fhirBundle("searchset", patients.map(patientResource), fhirBaseUrl(req)));
  });
}
