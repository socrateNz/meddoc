// HL7 v2 (étape E3 de l'audit d'évolution) — lecture et écriture de messages en codage ER7
// (segments séparés par \r, champs par |, composants par ^). Fonctions pures, sans base de
// données : l'import des résultats est dans src/lib/hl7-import.ts.
//
// Messages pris en charge : ORU^R01 (résultats d'un automate de laboratoire) en entrée ; ORM^O01
// (liste de travail de l'automate) et ACK en sortie. Le transport MLLP des automates n'est pas
// géré ici : une passerelle MLLP ↔ HTTPS (fournie avec la plupart des middlewares de laboratoire)
// poste les messages sur /api/hl7/oru.

export interface Hl7Segment {
  name: string;
  // fields[n] = champ n du segment (numérotation HL7) ; pour MSH, fields[1] est le séparateur.
  fields: string[];
}

const SEGMENT_SPLIT = /\r\n|\r|\n/;

export function splitSegments(message: string): string[] {
  return message.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
}

export function parseHl7(message: string): Hl7Segment[] {
  const lines = splitSegments(message.replace(/^\u000b/, "").replace(/\u001c\r?$/, ""));
  if (!lines[0]?.startsWith("MSH")) throw new Error("Message HL7 invalide : segment MSH attendu en tête.");
  const sep = lines[0][3];
  if (sep !== "|") throw new Error("Message HL7 invalide : séparateur de champ « | » attendu.");
  return lines.map((line) => {
    const parts = line.split(sep);
    const name = parts[0];
    // MSH-1 est le séparateur lui-même : on le réinsère pour garder la numérotation HL7.
    return { name, fields: name === "MSH" ? ["MSH", sep, ...parts.slice(1)] : parts };
  });
}

export function field(segment: Hl7Segment | undefined, index: number): string {
  return segment?.fields[index] ?? "";
}

// Composant (1-based) d'un champ, séquences d'échappement décodées.
export function component(value: string, index = 1): string {
  return unescapeHl7(value.split("~")[0].split("^")[index - 1] ?? "");
}

export function repetitions(value: string): string[] {
  return value ? value.split("~") : [];
}

export function unescapeHl7(value: string): string {
  return value.replace(/\\(F|S|T|R|E)\\/g, (_, c: string) => ({ F: "|", S: "^", T: "&", R: "~", E: "\\" })[c] ?? "");
}

export function escapeHl7(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\\/g, "\\E\\")
    .replace(/\|/g, "\\F\\")
    .replace(/\^/g, "\\S\\")
    .replace(/&/g, "\\T\\")
    .replace(/~/g, "\\R\\")
    .replace(/[\r\n]+/g, " ");
}

// Horodatage HL7 (AAAAMMJJHHMMSS) en UTC.
export function hl7Timestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function hl7Date(date: Date | string | null | undefined): string {
  return date ? new Date(date).toISOString().slice(0, 10).replace(/-/g, "") : "";
}

export interface OruObservation {
  code: string;
  text: string;
  value: string;
  unit: string;
  referenceRange: string;
  abnormalFlag: string;
  status: string;
  comment: string;
}

export interface OruOrder {
  placerOrderNumber: string;
  fillerOrderNumber: string;
  observations: OruObservation[];
}

export interface OruMessage {
  controlId: string;
  sendingApplication: string;
  sendingFacility: string;
  receivingApplication: string;
  receivingFacility: string;
  version: string;
  patientIdentifiers: string[];
  orders: OruOrder[];
}

export function parseOruR01(message: string): OruMessage {
  const segments = parseHl7(message);
  const msh = segments[0];
  const type = field(msh, 9);
  if (component(type, 1) !== "ORU" || component(type, 2) !== "R01") throw new Error(`Type de message non pris en charge : ${type || "(vide)"} (ORU^R01 attendu).`);

  const pid = segments.find((s) => s.name === "PID");
  const orders: OruOrder[] = [];
  let current: OruOrder | null = null;
  let lastObservation: OruObservation | null = null;
  for (const seg of segments) {
    if (seg.name === "OBR") {
      current = { placerOrderNumber: component(field(seg, 2)), fillerOrderNumber: component(field(seg, 3)), observations: [] };
      orders.push(current);
      lastObservation = null;
    } else if (seg.name === "OBX" && current) {
      lastObservation = {
        code: component(field(seg, 3), 1),
        text: component(field(seg, 3), 2),
        value: unescapeHl7(repetitions(field(seg, 5))[0] ?? ""),
        unit: component(field(seg, 6), 1),
        referenceRange: unescapeHl7(field(seg, 7)),
        abnormalFlag: component(field(seg, 8), 1),
        status: field(seg, 11),
        comment: "",
      };
      current.observations.push(lastObservation);
    } else if (seg.name === "NTE" && lastObservation) {
      lastObservation.comment = [lastObservation.comment, unescapeHl7(field(seg, 3))].filter(Boolean).join(" ");
    }
  }
  if (orders.length === 0) throw new Error("Message ORU^R01 sans segment OBR.");

  return {
    controlId: field(msh, 10),
    sendingApplication: field(msh, 3),
    sendingFacility: field(msh, 4),
    receivingApplication: field(msh, 5),
    receivingFacility: field(msh, 6),
    version: field(msh, 12) || "2.5",
    patientIdentifiers: repetitions(field(pid, 3))
      .map((r) => component(r, 1))
      .filter(Boolean),
    orders,
  };
}

// Indicateurs d'anomalie HL7 (table 0078) signalant un résultat anormal.
const ABNORMAL_FLAGS = new Set(["L", "H", "LL", "HH", "<", ">", "A", "AA", "LU", "HU"]);
export function isAbnormalFlag(flag: string): boolean {
  return ABNORMAL_FLAGS.has(flag.toUpperCase());
}

// Seuls les résultats définitifs ou corrigés sont importés (préliminaires et annulés ignorés).
export function isImportableStatus(status: string): boolean {
  return status === "" || status === "F" || status === "C";
}

export const MEDDOC_APPLICATION = "MEDDOC";

export function buildAck(params: {
  original: { controlId: string; sendingApplication: string; sendingFacility: string; receivingApplication: string; receivingFacility: string; version: string };
  code: "AA" | "AE" | "AR";
  text?: string;
  controlId?: string;
  now?: Date;
}): string {
  const { original } = params;
  const msh = [
    "MSH",
    "^~\\&",
    original.receivingApplication || MEDDOC_APPLICATION,
    original.receivingFacility,
    original.sendingApplication,
    original.sendingFacility,
    hl7Timestamp(params.now),
    "",
    "ACK^R01^ACK",
    params.controlId ?? `ACK${hl7Timestamp(params.now)}`,
    "P",
    original.version || "2.5",
  ].join("|");
  const msa = ["MSA", params.code, original.controlId, escapeHl7(params.text ?? "")].join("|");
  return `${msh}\r${msa}\r`;
}

export function buildOrmO01(params: {
  controlId: string;
  facility: string;
  now?: Date;
  patient: { id: string; ipp: string | null; lastName: string; firstName: string; dateOfBirth: Date | string | null; sex: string | null };
  order: { reference: string; tests: string[]; priority: string; orderedAt: Date | string; sampleCollectedAt: Date | string | null; sampleType: string | null };
}): string {
  const { patient, order } = params;
  const sex = patient.sex === "M" ? "M" : patient.sex === "F" ? "F" : "U";
  const pidIds = [patient.ipp ? `${escapeHl7(patient.ipp)}^^^MEDDOC^PI` : null, `${patient.id}^^^MEDDOC^PT`].filter(Boolean).join("~");
  const segments = [
    ["MSH", "^~\\&", MEDDOC_APPLICATION, escapeHl7(params.facility), "", "", hl7Timestamp(params.now), "", "ORM^O01^ORM_O01", params.controlId, "P", "2.5"].join("|"),
    ["PID", "1", "", pidIds, "", `${escapeHl7(patient.lastName)}^${escapeHl7(patient.firstName)}`, "", hl7Date(patient.dateOfBirth), sex].join("|"),
    ["ORC", "NW", order.reference, "", "", "", "", "", "", hl7Timestamp(new Date(order.orderedAt))].join("|"),
    ...order.tests.map((test, i) =>
      [
        "OBR",
        String(i + 1),
        order.reference,
        "",
        `^${escapeHl7(test)}`,
        order.priority === "URGENT" ? "S" : "R",
        hl7Timestamp(new Date(order.orderedAt)),
        order.sampleCollectedAt ? hl7Timestamp(new Date(order.sampleCollectedAt)) : "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        escapeHl7(order.sampleType ?? ""),
      ].join("|")
    ),
  ];
  return segments.join("\r") + "\r";
}
