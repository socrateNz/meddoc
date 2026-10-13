import { describe, it, expect } from "vitest";
import { buildAck, buildOrmO01, escapeHl7, isAbnormalFlag, isImportableStatus, parseHl7, parseOruR01, unescapeHl7 } from "./hl7";

const ORU = [
  "MSH|^~\\&|BC5150|LABO|MEDDOC|CLINIQUE|20261013091500||ORU^R01|MSG0001|P|2.5",
  "PID|1||IPP-2026-000042^^^MEDDOC^PI||NDIAYE^AWA||19900304|F",
  "OBR|1|LAB-A8B9C0D1||^NFS",
  "OBX|1|NM|HGB^Hémoglobine||6.2|g/dL|12-16|LL|||F",
  "NTE|1||Contrôlé sur 2e prélèvement",
  "OBX|2|ST|GLY^Glycémie||1,05|g/L|0.7-1.1|N|||P",
].join("\r");

describe("parseOruR01", () => {
  it("lit l'en-tête, le patient, la demande et les résultats", () => {
    const msg = parseOruR01(ORU);
    expect(msg.controlId).toBe("MSG0001");
    expect(msg.sendingApplication).toBe("BC5150");
    expect(msg.patientIdentifiers).toEqual(["IPP-2026-000042"]);
    expect(msg.orders).toHaveLength(1);
    expect(msg.orders[0].placerOrderNumber).toBe("LAB-A8B9C0D1");
    expect(msg.orders[0].observations[0]).toEqual({
      code: "HGB",
      text: "Hémoglobine",
      value: "6.2",
      unit: "g/dL",
      referenceRange: "12-16",
      abnormalFlag: "LL",
      status: "F",
      comment: "Contrôlé sur 2e prélèvement",
    });
    expect(msg.orders[0].observations[1].status).toBe("P");
  });

  it("accepte les fins de ligne \\n et l'enveloppe MLLP", () => {
    expect(parseOruR01(`\u000b${ORU.replace(/\r/g, "\n")}\u001c\r`).orders[0].observations).toHaveLength(2);
  });

  it("refuse un message qui n'est pas un ORU^R01", () => {
    expect(() => parseOruR01("PID|1")).toThrow(/MSH/);
    expect(() => parseOruR01("MSH|^~\\&|A|B|C|D|20261013||ADT^A01|1|P|2.5")).toThrow(/ORU\^R01/);
    expect(() => parseOruR01("MSH|^~\\&|A|B|C|D|20261013||ORU^R01|1|P|2.5\rPID|1")).toThrow(/OBR/);
  });

  it("garde la numérotation HL7 du MSH", () => {
    const [msh] = parseHl7(ORU);
    expect(msh.fields[1]).toBe("|");
    expect(msh.fields[9]).toBe("ORU^R01");
  });
});

describe("écriture", () => {
  it("échappe et déséchappe les caractères réservés", () => {
    const raw = "a|b^c&d~e\\f";
    expect(unescapeHl7(escapeHl7(raw))).toBe(raw);
    expect(escapeHl7("ligne1\nligne2")).toBe("ligne1 ligne2");
  });

  it("construit l'acquittement en inversant émetteur et destinataire", () => {
    const msg = parseOruR01(ORU);
    const ack = buildAck({ original: msg, code: "AE", text: "Analyse inconnue | ignorée", controlId: "ACK1", now: new Date("2026-10-13T08:00:00Z") });
    const [msh, msa] = ack.split("\r");
    expect(msh).toBe("MSH|^~\\&|MEDDOC|CLINIQUE|BC5150|LABO|20261013080000||ACK^R01^ACK|ACK1|P|2.5");
    expect(msa).toBe("MSA|AE|MSG0001|Analyse inconnue \\F\\ ignorée");
  });

  it("construit une demande ORM^O01 avec un OBR par analyse", () => {
    const orm = buildOrmO01({
      controlId: "ORM1",
      facility: "Clinique",
      now: new Date("2026-10-13T08:00:00Z"),
      patient: { id: "p1", ipp: "IPP-2026-000042", lastName: "Ndiaye", firstName: "Awa", dateOfBirth: "1990-03-04T00:00:00Z", sex: "F" },
      order: { reference: "LAB-A8B9C0D1", tests: ["NFS", "Glycémie"], priority: "URGENT", orderedAt: "2026-10-13T07:00:00Z", sampleCollectedAt: null, sampleType: "BLOOD" },
    });
    const segs = orm.trim().split("\r");
    expect(segs.map((s) => s.slice(0, 3))).toEqual(["MSH", "PID", "ORC", "OBR", "OBR"]);
    expect(segs[1]).toContain("IPP-2026-000042^^^MEDDOC^PI~p1^^^MEDDOC^PT");
    expect(segs[1]).toContain("|19900304|F");
    expect(segs[3]).toMatch(/^OBR\|1\|LAB-A8B9C0D1\|\|\^NFS\|S\|/);
    // Relu par notre propre lecteur : structure valide.
    expect(parseHl7(orm)).toHaveLength(5);
  });

  it("classe les indicateurs et statuts de résultat", () => {
    expect(isAbnormalFlag("HH")).toBe(true);
    expect(isAbnormalFlag("N")).toBe(false);
    expect(isImportableStatus("F")).toBe(true);
    expect(isImportableStatus("C")).toBe(true);
    expect(isImportableStatus("P")).toBe(false);
  });
});
