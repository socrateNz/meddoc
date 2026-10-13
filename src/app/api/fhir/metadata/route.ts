import { capabilityStatement } from "@/lib/fhir";
import { fhirBaseUrl, fhirJson } from "@/lib/fhir-server";

// Déclaration des capacités FHIR (publique, sans données patient).
export async function GET(req: Request) {
  return fhirJson(capabilityStatement(fhirBaseUrl(req)));
}
