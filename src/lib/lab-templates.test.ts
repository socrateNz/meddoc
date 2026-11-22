import { describe, it, expect } from "vitest";
import { TEMPLATE_PRESETS, emptyResultData, evaluateResult, hasAnyValue, parseStoredResult, parseTemplate, presetById, referenceText } from "./lab-templates";

describe("modèles prêts à l'emploi", () => {
  it("sont tous valides, avec des clés de champ uniques", () => {
    for (const preset of TEMPLATE_PRESETS) {
      expect(parseTemplate(preset.template), preset.id).not.toBeNull();
      const keys = preset.template.sections.flatMap((s) => s.fields.map((f) => f.key));
      expect(new Set(keys).size, preset.id).toBe(keys.length);
    }
    expect(new Set(TEMPLATE_PRESETS.map((p) => p.id)).size).toBe(TEMPLATE_PRESETS.length);
  });

  it("pré-remplissent les valeurs par défaut (« Absents », « Négatif »), jamais les chiffres", () => {
    const ecbu = emptyResultData(presetById("ecbu")!.template);
    expect(ecbu.values.casts).toBe("Absents");
    const transaminases = emptyResultData(presetById("transaminases")!.template);
    expect(transaminases.values.asat).toBe("");
  });
});

describe("evaluateResult", () => {
  it("signale une valeur chiffrée hors des valeurs de référence", () => {
    const t = presetById("transaminases")!.template;
    const r = evaluateResult(t, { values: { asat: "39", alat: "66,7" } });
    expect(r.isAbnormal).toBe(true);
    expect(r.abnormalKeys).toEqual(["alat"]);
    expect(r.summary).toBe("ASAT : 39 UI/L ; ALAT : 66,7 UI/L");
  });

  it("signale un choix anormal (sérologie positive) et met la conclusion en tête du résumé", () => {
    const t = presetById("aghbs")!.template;
    const r = evaluateResult(t, { values: { aghbs: "Présence d'antigène HBs" }, conclusion: "Sérologie positive" });
    expect(r.isAbnormal).toBe(true);
    expect(r.summary).toMatch(/^Sérologie positive — AgHBs : Présence/);
  });

  it("ne signale rien pour une borne seule respectée (ASLO < 200)", () => {
    const t = presetById("aslo")!.template;
    expect(evaluateResult(t, { values: { aslo: "150" } }).isAbnormal).toBe(false);
    expect(evaluateResult(t, { values: { aslo: "400" } }).isAbnormal).toBe(true);
    expect(referenceText(t.sections[0].fields[0])).toBe("< 200");
  });

  it("considère vide un compte rendu sans aucune valeur ni conclusion", () => {
    const t = presetById("transaminases")!.template;
    expect(hasAnyValue(t, { values: { asat: " " } })).toBe(false);
    expect(hasAnyValue(t, { values: {}, conclusion: "RAS" })).toBe(true);
  });
});

describe("parseStoredResult", () => {
  it("relit un résultat enregistré avec son modèle, et ignore un ancien résultat sans modèle", () => {
    const template = presetById("blood-group")!.template;
    expect(parseStoredResult({ template, values: { abo: "O", rh: "Positif" } })?.values.abo).toBe("O");
    expect(parseStoredResult(null)).toBeNull();
    expect(parseStoredResult({ values: {} })).toBeNull();
  });
});
