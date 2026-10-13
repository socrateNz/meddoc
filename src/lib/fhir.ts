// FHIR R4 (étape E3 de l'audit d'évolution) — conversion des données MedDoc en ressources FHIR,
// en lecture seule. Fonctions pures ; les routes sont sous src/app/api/fhir/. Seuls les résultats
// VALIDÉS (laboratoire, imagerie) sont exposés : un résultat non validé n'est pas définitif.

export const FHIR_CONTENT_TYPE = "application/fhir+json; charset=utf-8";
export const IPP_SYSTEM = "https://meddoc.tacynt.com/fhir/sid/ipp";
const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
const OBS_CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category";
const INTERPRETATION = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";

type Resource = Record<string, unknown> & { resourceType: string; id: string };

export function fhirGender(sex: string | null | undefined): "male" | "female" | "other" | "unknown" {
  if (sex === "M") return "male";
  if (sex === "F") return "female";
  if (sex) return "other";
  return "unknown";
}

export function toFhirPatient(p: {
  id: string;
  ipp: string | null;
  sex: string | null;
  dateOfBirth: Date | string;
  address?: string | null;
  bloodType?: string | null;
  user: { firstName: string; lastName: string; phone?: string | null } | null;
}): Resource {
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: p.ipp ? [{ use: "official", system: IPP_SYSTEM, value: p.ipp }] : [],
    name: p.user ? [{ use: "official", family: p.user.lastName, given: [p.user.firstName] }] : [],
    gender: fhirGender(p.sex),
    birthDate: new Date(p.dateOfBirth).toISOString().slice(0, 10),
    ...(p.user?.phone ? { telecom: [{ system: "phone", value: p.user.phone }] } : {}),
    ...(p.address ? { address: [{ text: p.address }] } : {}),
  };
}

function quantity(value: number, unit: string, code: string) {
  return { value, unit, system: UCUM, code };
}

function vitalObservation(id: string, patientId: string, date: string, loinc: string, display: string, value: Record<string, unknown>): Resource {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    category: [{ coding: [{ system: OBS_CATEGORY, code: "vital-signs" }] }],
    code: { coding: [{ system: LOINC, code: loinc, display }], text: display },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: date,
    ...value,
  };
}

// Un relevé MedDoc (plusieurs constantes) → une Observation FHIR par constante.
export function vitalSignObservations(v: {
  id: string;
  patientId: string;
  createdAt: Date | string;
  temperature: number | null;
  bloodPressure: string | null;
  heartRate: number | null;
  oxygenSaturation: number | null;
  bloodSugar: number | null;
  weight: number | null;
  painScore: number | null;
}): Resource[] {
  const date = new Date(v.createdAt).toISOString();
  const out: Resource[] = [];
  if (v.temperature != null) out.push(vitalObservation(`${v.id}-temp`, v.patientId, date, "8310-5", "Température corporelle", { valueQuantity: quantity(v.temperature, "°C", "Cel") }));
  if (v.heartRate != null) out.push(vitalObservation(`${v.id}-hr`, v.patientId, date, "8867-4", "Fréquence cardiaque", { valueQuantity: quantity(v.heartRate, "/min", "/min") }));
  if (v.oxygenSaturation != null) out.push(vitalObservation(`${v.id}-spo2`, v.patientId, date, "59408-5", "Saturation en oxygène", { valueQuantity: quantity(v.oxygenSaturation, "%", "%") }));
  if (v.weight != null) out.push(vitalObservation(`${v.id}-weight`, v.patientId, date, "29463-7", "Poids", { valueQuantity: quantity(v.weight, "kg", "kg") }));
  if (v.bloodSugar != null) out.push(vitalObservation(`${v.id}-glu`, v.patientId, date, "2339-0", "Glycémie", { valueQuantity: quantity(v.bloodSugar, "g/L", "g/L") }));
  if (v.painScore != null) out.push(vitalObservation(`${v.id}-pain`, v.patientId, date, "72514-3", "Intensité de la douleur (0-10)", { valueQuantity: quantity(v.painScore, "{score}", "{score}") }));
  const bp = v.bloodPressure ? /^(\d{2,3})\/(\d{2,3})$/.exec(v.bloodPressure.replace(/\s/g, "")) : null;
  if (bp) {
    out.push(
      vitalObservation(`${v.id}-bp`, v.patientId, date, "85354-9", "Pression artérielle", {
        component: [
          { code: { coding: [{ system: LOINC, code: "8480-6", display: "Systolique" }] }, valueQuantity: quantity(Number(bp[1]), "mmHg", "mm[Hg]") },
          { code: { coding: [{ system: LOINC, code: "8462-4", display: "Diastolique" }] }, valueQuantity: quantity(Number(bp[2]), "mmHg", "mm[Hg]") },
        ],
      })
    );
  }
  return out;
}

export function labResultObservation(r: {
  id: string;
  patientId: string;
  testName: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  isAbnormal: boolean;
  notes: string | null;
  validatedAt: Date | string;
}): Resource {
  const numeric = /^-?\d+(\.\d+)?$/.test(r.value.trim().replace(",", ".")) ? Number(r.value.trim().replace(",", ".")) : null;
  return {
    resourceType: "Observation",
    id: r.id,
    status: "final",
    category: [{ coding: [{ system: OBS_CATEGORY, code: "laboratory" }] }],
    code: { text: r.testName },
    subject: { reference: `Patient/${r.patientId}` },
    effectiveDateTime: new Date(r.validatedAt).toISOString(),
    issued: new Date(r.validatedAt).toISOString(),
    ...(numeric != null ? { valueQuantity: { value: numeric, ...(r.unit ? { unit: r.unit } : {}) } } : { valueString: r.value }),
    ...(r.isAbnormal ? { interpretation: [{ coding: [{ system: INTERPRETATION, code: "A", display: "Anormal" }] }] } : {}),
    ...(r.referenceRange ? { referenceRange: [{ text: r.referenceRange }] } : {}),
    ...(r.notes ? { note: [{ text: r.notes }] } : {}),
  };
}

export function labDiagnosticReport(o: { id: string; patientId: string; tests: string[]; createdAt: Date | string; updatedAt: Date | string; resultIds: string[] }): Resource {
  return {
    resourceType: "DiagnosticReport",
    id: o.id,
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "LAB", display: "Laboratoire" }] }],
    code: { text: o.tests.join(", ") },
    subject: { reference: `Patient/${o.patientId}` },
    effectiveDateTime: new Date(o.createdAt).toISOString(),
    issued: new Date(o.updatedAt).toISOString(),
    result: o.resultIds.map((id) => ({ reference: `Observation/${id}` })),
  };
}

export function radiologyDiagnosticReport(o: {
  id: string;
  patientId: string;
  exams: { name: string }[];
  performedAt: Date | string | null;
  validatedAt: Date | string;
  report: string | null;
  conclusion: string | null;
}): Resource {
  return {
    resourceType: "DiagnosticReport",
    id: o.id,
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0074", code: "RAD", display: "Imagerie" }] }],
    code: { text: o.exams.map((e) => e.name).join(", ") },
    subject: { reference: `Patient/${o.patientId}` },
    ...(o.performedAt ? { effectiveDateTime: new Date(o.performedAt).toISOString() } : {}),
    issued: new Date(o.validatedAt).toISOString(),
    ...(o.conclusion ? { conclusion: o.conclusion } : {}),
    ...(o.report ? { presentedForm: [{ contentType: "text/plain; charset=utf-8", data: Buffer.from(o.report, "utf8").toString("base64"), title: "Compte-rendu" }] } : {}),
  };
}

export function fhirBundle(type: "searchset" | "collection", resources: Resource[], baseUrl: string): Record<string, unknown> {
  return {
    resourceType: "Bundle",
    type,
    timestamp: new Date().toISOString(),
    ...(type === "searchset" ? { total: resources.length } : {}),
    entry: resources.map((resource) => ({
      fullUrl: `${baseUrl}/${resource.resourceType}/${resource.id}`,
      resource,
      ...(type === "searchset" ? { search: { mode: "match" } } : {}),
    })),
  };
}

export function operationOutcome(code: "not-found" | "forbidden" | "invalid" | "security" | "not-supported" | "exception", diagnostics: string): Record<string, unknown> {
  return { resourceType: "OperationOutcome", issue: [{ severity: "error", code, diagnostics }] };
}

export function capabilityStatement(baseUrl: string): Record<string, unknown> {
  const read = [{ code: "read" }, { code: "search-type" }];
  return {
    resourceType: "CapabilityStatement",
    status: "active",
    date: "2026-10-13",
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["json"],
    implementation: { description: "MedDoc — API FHIR en lecture seule", url: baseUrl },
    rest: [
      {
        mode: "server",
        security: { description: "Clé d'API par clinique (en-tête Authorization: Bearer <clé>), portée fhir:read." },
        resource: [
          { type: "Patient", interaction: read, searchParam: [{ name: "identifier", type: "token" }, { name: "_id", type: "token" }], operation: [{ name: "everything", definition: "http://hl7.org/fhir/OperationDefinition/Patient-everything" }] },
          { type: "Observation", interaction: [{ code: "search-type" }], searchParam: [{ name: "patient", type: "reference" }, { name: "category", type: "token" }] },
          { type: "DiagnosticReport", interaction: [{ code: "search-type" }], searchParam: [{ name: "patient", type: "reference" }] },
        ],
      },
    ],
  };
}
