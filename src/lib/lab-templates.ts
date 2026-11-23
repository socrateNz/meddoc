import { z } from "zod";

// Modèles de résultats d'examen (cf. LabTest.resultTemplate, LabResult.data) — pur, sans accès base :
// partagé par le catalogue, la saisie des résultats, le serveur et le rapport PDF.
//
// Un modèle décrit le compte rendu d'un examen sous forme de sections de champs :
// - « number » : valeur chiffrée, unité, valeurs de référence (biochimie, ASLO, NFS...) ;
// - « choice » : un choix dans une liste (Négatif/Positif, AA/AS, Absents/Rares/Présents ++...) ;
// - « text »   : texte libre (aspect, germe identifié...).
// Plus, au besoin : technique, conclusion rédigée, antibiogramme / antifongigramme (S/I/R), note fixe.
// Les modèles prêts à l'emploi ci-dessous reprennent les comptes rendus des laboratoires de terrain ;
// chaque clinique les adapte à ses réactifs et valeurs de référence depuis le catalogue.

const fieldSchema = z.discriminatedUnion("type", [
  z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.literal("number"),
    unit: z.string().optional(),
    refLow: z.number().optional(),
    refHigh: z.number().optional(),
    refText: z.string().optional(),
  }),
  z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.literal("choice"),
    options: z.array(z.string().min(1)).min(1),
    abnormal: z.array(z.string()).optional(),
    default: z.string().optional(),
    unit: z.string().optional(),
    refText: z.string().optional(),
  }),
  z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.literal("text"),
    default: z.string().optional(),
    multiline: z.boolean().optional(),
  }),
]);

export const resultTemplateSchema = z.object({
  version: z.literal(1),
  title: z.string().optional(),
  technique: z.string().optional(),
  sections: z
    .array(z.object({ title: z.string().optional(), layout: z.enum(["table", "lines"]).optional(), fields: z.array(fieldSchema).min(1) }))
    .min(1),
  conclusion: z.boolean().optional(),
  antibiogram: z.boolean().optional(),
  antifungigram: z.boolean().optional(),
  note: z.string().optional(),
});

export type ResultTemplate = z.infer<typeof resultTemplateSchema>;
export type ResultField = ResultTemplate["sections"][number]["fields"][number];
export type Susceptibility = "S" | "I" | "R";

export const resultDataSchema = z.object({
  values: z.record(z.string(), z.string().max(2000)),
  conclusion: z.string().max(4000).optional(),
  germ: z.string().max(300).optional(),
  antibiogram: z.record(z.string(), z.enum(["S", "I", "R"])).optional(),
  antifungigram: z.record(z.string(), z.enum(["S", "I", "R"])).optional(),
});
export type ResultData = z.infer<typeof resultDataSchema>;

// Résultat enregistré : les valeurs ET le modèle tel qu'il était à la saisie (une modification
// ultérieure du catalogue ne change jamais un compte rendu déjà rendu).
export type StoredResultData = ResultData & { template: ResultTemplate };

export function parseTemplate(raw: unknown): ResultTemplate | null {
  const parsed = resultTemplateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseStoredResult(raw: unknown): StoredResultData | null {
  if (!raw || typeof raw !== "object") return null;
  const template = parseTemplate((raw as { template?: unknown }).template);
  const data = resultDataSchema.safeParse(raw);
  return template && data.success ? { ...data.data, template } : null;
}

// Paillasses du laboratoire (LabTest.department) : liste proposée, la clinique peut en saisir d'autres.
export const LAB_BENCHES = ["Biochimie", "Hématologie", "Sérologie", "Immunologie", "Parasitologie", "Bactériologie", "Hormonologie"];

export const ANTIBIOTICS = [
  "Amoxicilline",
  "Amoxicilline + Acide clavulanique",
  "Céfuroxime",
  "Céfixime",
  "Céfotaxime",
  "Ceftriaxone",
  "Ceftazidime",
  "Imipénème",
  "Gentamicine",
  "Amikacine",
  "Ciprofloxacine",
  "Ofloxacine",
  "Lévofloxacine",
  "Norfloxacine",
  "Acide nalidixique",
  "Nitrofurantoïne",
  "Cotrimoxazole",
  "Érythromycine",
  "Azithromycine",
  "Vancomycine",
  "Doxycycline",
];

export const ANTIFUNGALS = ["Nystatine", "Miconazole", "Clotrimazole", "Éconazole", "Fluconazole", "Kétoconazole", "Voriconazole", "Amphotéricine B"];

export const SUSCEPTIBILITY_LABELS: Record<Susceptibility, string> = { S: "Sensible", I: "Intermédiaire", R: "Résistant" };

// ---------- Évaluation ----------

export function fieldDefault(field: ResultField): string {
  return field.type === "number" ? "" : field.default ?? "";
}

export function emptyResultData(template: ResultTemplate): ResultData {
  const values: Record<string, string> = {};
  for (const section of template.sections) for (const f of section.fields) values[f.key] = fieldDefault(f);
  return { values, conclusion: "" };
}

export function referenceText(field: ResultField): string {
  if (field.type === "text") return "";
  if (field.refText) return field.refText;
  if (field.type === "number") {
    if (field.refLow != null && field.refHigh != null) return `${field.refLow} – ${field.refHigh}`;
    if (field.refHigh != null) return `< ${field.refHigh}`;
    if (field.refLow != null) return `> ${field.refLow}`;
  }
  return "";
}

function toNumber(value: string): number | null {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return value.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function isFieldAbnormal(field: ResultField, value: string | undefined): boolean {
  if (!value) return false;
  if (field.type === "number") {
    const n = toNumber(value);
    if (n == null) return false;
    return (field.refLow != null && n < field.refLow) || (field.refHigh != null && n > field.refHigh);
  }
  if (field.type === "choice") return (field.abnormal ?? []).includes(value);
  return false;
}

// Anomalies et résumé texte (LabResult.value : listes, recherche, IA, ancien affichage).
export function evaluateResult(template: ResultTemplate, data: ResultData): { isAbnormal: boolean; summary: string; abnormalKeys: string[] } {
  const abnormalKeys: string[] = [];
  const parts: string[] = [];
  for (const section of template.sections) {
    for (const f of section.fields) {
      const v = (data.values[f.key] ?? "").trim();
      if (!v) continue;
      if (isFieldAbnormal(f, v)) abnormalKeys.push(f.key);
      const unit = f.type !== "text" && f.unit ? ` ${f.unit}` : "";
      parts.push(`${f.label} : ${v}${unit}`);
    }
  }
  const head = data.conclusion?.trim() ? `${data.conclusion.trim()} — ` : "";
  const summary = (head + parts.join(" ; ")).slice(0, 1000) || "Résultat saisi";
  return { isAbnormal: abnormalKeys.length > 0, summary, abnormalKeys };
}

export function hasAnyValue(template: ResultTemplate, data: ResultData): boolean {
  return template.sections.some((s) => s.fields.some((f) => (data.values[f.key] ?? "").trim() !== "")) || !!data.conclusion?.trim();
}

// ---------- Modèles prêts à l'emploi ----------

const PRESENCE = ["Absents", "Rares", "Quelques", "Présents +", "Présents ++", "Présents +++"];
const PRESENCE_F = ["Absentes", "Rares", "Quelques", "Présentes +", "Présentes ++", "Présentes +++"];
const NEG_POS = ["Négatif", "Positif"];
const REACTIVE = ["Non réactif", "Réactif"];

const num = (key: string, label: string, unit?: string, refLow?: number, refHigh?: number, refText?: string): ResultField => ({
  key,
  label,
  type: "number",
  unit,
  refLow,
  refHigh,
  refText,
});
const choice = (key: string, label: string, options: string[], opts: { default?: string; abnormal?: string[]; unit?: string; refText?: string } = {}): ResultField => ({
  key,
  label,
  type: "choice",
  options,
  ...opts,
});
const text = (key: string, label: string, def?: string, multiline?: boolean): ResultField => ({ key, label, type: "text", default: def, multiline });
const presence = (key: string, label: string, feminine = false) =>
  choice(key, label, feminine ? PRESENCE_F : PRESENCE, { default: feminine ? "Absentes" : "Absents" });

// Sérologie rapide : résultat, méthode, conclusion et note éventuelle.
function rapidTest(key: string, label: string, method: string, options: string[], positive: string, note?: string): ResultTemplate {
  return {
    version: 1,
    technique: method,
    sections: [{ fields: [choice(key, label, options, { default: options[0], abnormal: [positive] })] }],
    conclusion: true,
    note,
  };
}

const HIV_NOTE =
  "Une sérologie négative ne confirme ou n'infirme pas un résultat négatif. Bien vouloir refaire après 3 mois à compter de la date du dernier prélèvement car le patient pourrait être en phase de séroconversion.";

export type TemplatePreset = { id: string; name: string; bench: string; template: ResultTemplate };

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  // --- Biochimie ---
  {
    id: "numeric",
    name: "Valeur chiffrée (vierge)",
    bench: "Biochimie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("result", "Résultat")] }] },
  },
  {
    id: "uric-acid",
    name: "Acide urique",
    bench: "Biochimie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("uric", "Acide urique", "mg/dL", 3.4, 7)] }] },
  },
  {
    id: "transaminases",
    name: "Transaminases (ASAT / ALAT)",
    bench: "Biochimie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("asat", "ASAT", "UI/L", 0, 40), num("alat", "ALAT", "UI/L", 0, 40)] }] },
  },
  {
    id: "albumin",
    name: "Albuminémie",
    bench: "Biochimie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("albumin", "Albuminémie", "g/L", 38, 51)] }] },
  },
  {
    id: "glycemia",
    name: "Glycémie",
    bench: "Biochimie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("glucose", "Glycémie", "g/L", 0.7, 1.1)] }] },
  },
  {
    id: "urine-alb-sugar",
    name: "Albumine / Sucre (urines)",
    bench: "Biochimie",
    template: {
      version: 1,
      sections: [
        {
          layout: "table",
          fields: [
            choice("albumin", "Albumine", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
            choice("glucose", "Glucose", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
          ],
        },
      ],
    },
  },
  // --- Sérologie / immunologie ---
  {
    id: "aslo",
    name: "ASLO (antistreptolysine O)",
    bench: "Sérologie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("aslo", "ASLO (Streptolysine O)", "UI/mL", undefined, 200, "< 200")] }] },
  },
  {
    id: "rf",
    name: "Facteur rhumatoïde",
    bench: "Sérologie",
    template: { version: 1, sections: [{ layout: "table", fields: [num("rf", "FR (Facteur rhumatoïde)", "UI/mL", undefined, 8, "< 8")] }] },
  },
  {
    id: "crp",
    name: "CRP (protéine C réactive)",
    bench: "Sérologie",
    template: {
      version: 1,
      technique: "Agglutination sur plaque",
      sections: [
        {
          layout: "table",
          fields: [choice("crp", "Résultat", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }), num("titer", "Titre", "mg/L", undefined, 6, "< 6")],
        },
      ],
      note: "Sérologie CRP positive si titre ≥ 6 mg/L.",
    },
  },
  {
    id: "aghbs",
    name: "AgHBs (hépatite B)",
    bench: "Sérologie",
    template: rapidTest(
      "aghbs",
      "AgHBs",
      "Test de dépistage sur bandelette rapide (one-step)",
      ["Absence d'antigène HBs", "Présence d'antigène HBs"],
      "Présence d'antigène HBs",
      "Bien vouloir faire un ELISA pour confirmation si le test est positif, ou avant la vaccination."
    ),
  },
  {
    id: "achcv",
    name: "AcHCV (hépatite C)",
    bench: "Sérologie",
    template: rapidTest("achcv", "AcHCV", "Test de dépistage rapide (one-step)", ["Absence d'anticorps anti-HCV", "Présence d'anticorps anti-HCV"], "Présence d'anticorps anti-HCV"),
  },
  {
    id: "hiv",
    name: "Sérodiagnostic du VIH",
    bench: "Sérologie",
    template: {
      version: 1,
      sections: [
        {
          fields: [
            choice("method", "Test de dépistage", ["Determine", "First Response", "OraQuick", "Autre"], { default: "Determine" }),
            choice("hiv", "Résultat", REACTIVE, { default: "Non réactif", abnormal: ["Réactif"] }),
          ],
        },
      ],
      conclusion: true,
      note: HIV_NOTE,
    },
  },
  {
    id: "hpylori",
    name: "Helicobacter pylori",
    bench: "Sérologie",
    template: rapidTest("hp", "Helicobacter pylori", "Test rapide", ["Recherche négative", "Recherche positive"], "Recherche positive"),
  },
  {
    id: "syphilis",
    name: "Syphilis (TPHA / VDRL)",
    bench: "Sérologie",
    template: {
      version: 1,
      sections: [
        {
          fields: [
            choice("tpha", "TPHA (Treponema pallidum hemagglutination assay)", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
            choice("vdrl", "VDRL (Venereal disease research laboratory)", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
          ],
        },
      ],
      conclusion: true,
      note:
        "Le TPHA se positive vers le 10e jour du chancre, quelques jours avant le VDRL. Il reste positif pendant plusieurs années, même chez le malade correctement traité ; le titre des anticorps n'est pas corrélé à l'évolutivité de la maladie.",
    },
  },
  ...(["Toxoplasmose", "Rubéole", "Chlamydiae"].map((name) => ({
    id: `igm-igg-${name.toLowerCase()}`,
    name: `${name} (IgM / IgG)`,
    bench: "Sérologie",
    template: {
      version: 1 as const,
      sections: [
        {
          fields: [
            choice("igm", "IgM", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
            choice("igg", "IgG", NEG_POS, { default: "Négatif" }),
          ],
        },
      ],
      conclusion: true,
    },
  })) satisfies TemplatePreset[]),
  {
    id: "widal",
    name: "Sérodiagnostic de Widal et Félix",
    bench: "Sérologie",
    template: {
      version: 1,
      technique: "Agglutination sur plaque",
      sections: (() => {
        const titers = ["Négatif", "1/20", "1/40", "1/80", "1/160", "1/320", "1/640"];
        const t = (key: string, label: string) => choice(key, label, titers, { default: "Négatif", abnormal: ["1/160", "1/320", "1/640"] });
        return [
          { title: "Anticorps somatiques", layout: "table" as const, fields: [t("to", "TO"), t("ao", "AO"), t("bo", "BO"), t("co", "CO")] },
          { title: "Anticorps flagellaires", layout: "table" as const, fields: [t("th", "TH"), t("ah", "AH"), t("bh", "BH"), t("ch", "CH")] },
        ];
      })(),
      conclusion: true,
    },
  },
  // --- Hématologie ---
  {
    id: "hb-electrophoresis",
    name: "Électrophorèse de l'hémoglobine",
    bench: "Hématologie",
    template: {
      version: 1,
      technique: "SickleVue",
      sections: [{ layout: "table", fields: [choice("profile", "Électrophorèse", ["AA", "AS", "AC", "SS", "SC", "CC"], { default: "AA", abnormal: ["SS", "SC", "CC"] })] }],
    },
  },
  {
    id: "blood-group",
    name: "Groupe sanguin / Rhésus",
    bench: "Hématologie",
    template: {
      version: 1,
      sections: [
        {
          layout: "table",
          fields: [choice("abo", "Groupe", ["O", "A", "B", "AB"], { default: "O" }), choice("rh", "Rhésus", ["Positif", "Négatif"], { default: "Positif" })],
        },
      ],
    },
  },
  {
    id: "nfs",
    name: "NFS (numération formule sanguine)",
    bench: "Hématologie",
    template: {
      version: 1,
      sections: [
        {
          title: "Hémogramme",
          layout: "table",
          fields: [
            num("wbc", "Globules blancs", "10³/µL", 4, 10),
            num("rbc", "Globules rouges", "10⁶/µL", 4, 5.5),
            num("hb", "Hémoglobine", "g/dL", 12, 16),
            num("hct", "Hématocrite", "%", 36, 48),
            num("mcv", "VGM", "fL", 80, 100),
            num("mch", "TCMH", "pg", 27, 32),
            num("mchc", "CCMH", "g/dL", 32, 36),
            num("plt", "Plaquettes", "10³/µL", 150, 400),
          ],
        },
        {
          title: "Formule leucocytaire",
          layout: "table",
          fields: [
            num("neut", "Neutrophiles", "%", 40, 70),
            num("lymph", "Lymphocytes", "%", 20, 40),
            num("mono", "Monocytes", "%", 2, 10),
            num("eos", "Éosinophiles", "%", 1, 6),
            num("baso", "Basophiles", "%", 0, 1),
          ],
        },
      ],
      conclusion: true,
    },
  },
  // --- Parasitologie ---
  {
    id: "thick-smear",
    name: "Goutte épaisse (paludisme)",
    bench: "Parasitologie",
    template: {
      version: 1,
      technique: "Goutte épaisse, coloration au Giemsa",
      sections: [
        {
          fields: [
            choice("result", "Résultat", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
            choice("genus", "Genre", ["/", "Trophozoïtes de Plasmodium falciparum", "Plasmodium malariae", "Plasmodium ovale", "Plasmodium vivax", "Gamétocytes de P. falciparum"], {
              default: "/",
            }),
            num("density", "Densité parasitaire", "trophozoïtes/mm³"),
          ],
        },
      ],
    },
  },
  {
    id: "stool-parasito",
    name: "Examen parasitologique des selles",
    bench: "Parasitologie",
    template: {
      version: 1,
      title: "PARASITOLOGIE DES SELLES",
      sections: [
        { title: "Examen macroscopique", fields: [text("aspect", "Aspect", "Selles molles")] },
        {
          title: "Cytologie",
          fields: [
            presence("leuco", "Leucocytes"),
            presence("rbc", "Hématies", true),
            presence("budding", "Levures bourgeonnantes", true),
            presence("nonbudding", "Levures non bourgeonnantes", true),
            presence("bacilli", "Bacilles"),
            presence("charcot", "Cristaux de Charcot-Leyden"),
            presence("oxalate", "Cristaux d'oxalate de calcium"),
            presence("phosphate", "Cristaux de phosphates ammoniaco-magnésiens"),
            presence("urate", "Cristaux d'urates"),
            presence("cholesterol", "Cristaux de cholestérol"),
          ],
        },
        {
          title: "Digestion",
          fields: [
            choice("cellDig", "Cellulose digestible", ["Absente", "Présente +", "Présente ++", "Présente +++"], { default: "Absente" }),
            choice("cellNonDig", "Cellulose non digestible", ["Absente", "Présente +", "Présente ++", "Présente +++"], { default: "Absente" }),
            choice("muscleDig", "Fibres musculaires digérées", ["Absentes", "Présentes +", "Présentes ++", "Présentes +++"], { default: "Absentes" }),
            choice("muscleNonDig", "Fibres musculaires non digérées", ["Absentes", "Présentes +", "Présentes ++", "Présentes +++"], { default: "Absentes" }),
            text("flora", "Flore bactérienne", "Normale"),
          ],
        },
        {
          title: "Parasites",
          fields: [
            text("cysts", "Kystes d'amibe", "Absents"),
            text("eggs", "Œufs de parasites", "Absents"),
            text("concentration", "Recherche d'œufs après concentration", "Absents"),
            text("other", "Autres", "Absents"),
          ],
        },
      ],
      conclusion: true,
    },
  },
  // --- Bactériologie ---
  {
    id: "urine-strip",
    name: "Bandelette urinaire",
    bench: "Bactériologie",
    template: {
      version: 1,
      title: "BANDELETTE URINAIRE",
      sections: [
        {
          layout: "table",
          fields: [
            choice("leu", "Leucocytes", ["Négatif", "Traces", "+", "++", "+++"], { default: "Négatif", abnormal: ["+", "++", "+++"] }),
            choice("nit", "Nitrites", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
            choice("uro", "Urobilinogène", ["Négatif", "Normal", "+", "++", "+++"], { default: "Négatif" }),
            choice("pro", "Protéines", ["Négatif", "Traces", "+", "++", "+++"], { default: "Négatif", abnormal: ["+", "++", "+++"] }),
            text("ph", "pH", "6"),
            choice("blood", "Sang", ["Négatif", "Traces", "+", "++", "+++"], { default: "Négatif", abnormal: ["+", "++", "+++"] }),
            text("sg", "Densité", "1,020"),
            choice("asc", "Acide ascorbique", ["Négatif", "+", "++"], { default: "Négatif" }),
            choice("ket", "Cétones", ["Négatif", "Traces", "+", "++", "+++"], { default: "Négatif", abnormal: ["+", "++", "+++"] }),
            choice("bil", "Bilirubine", ["Négatif", "+", "++", "+++"], { default: "Négatif", abnormal: ["+", "++", "+++"] }),
            choice("glu", "Glucose", ["Négatif", "Traces", "+", "++", "+++"], { default: "Négatif", abnormal: ["+", "++", "+++"] }),
          ],
        },
      ],
    },
  },
  {
    id: "ecbu",
    name: "ECBU (examen cytobactériologique des urines)",
    bench: "Bactériologie",
    template: {
      version: 1,
      title: "EXAMEN CYTOBACTÉRIOLOGIQUE DES URINES",
      sections: [
        { title: "Renseignements", fields: [text("antibio", "Antibiothérapie", "RAS"), text("sampling", "Prélèvement", "Miction volontaire (milieu du jet)")] },
        {
          title: "Examen macroscopique",
          fields: [
            choice("clarity", "Aspect", ["Limpide", "Légèrement trouble", "Trouble", "Hématique"], { default: "Limpide" }),
            text("color", "Couleur", "Jaune"),
            text("ph", "pH", "6"),
          ],
        },
        {
          title: "Examen microscopique",
          fields: [
            text("leucoCount", "Leucocytes", "< 10 000 /mL"),
            text("rbcCount", "Hématies", "< 10 000 /mL"),
            presence("epith", "Cellules épithéliales", true),
            presence("renal", "Cellules rénales", true),
            presence("casts", "Cylindres"),
            text("crystals", "Cristaux", "Absents"),
            text("yeast", "Levures", "Absentes"),
          ],
        },
        {
          title: "Coloration de Gram",
          fields: [
            presence("bgp", "Bacilles à Gram positif"),
            presence("bgn", "Bacilles à Gram négatif"),
            presence("cgp", "Cocci à Gram positif"),
            text("gramOther", "Autres", "/"),
          ],
        },
        {
          title: "Culture",
          fields: [
            text("culture", "Culture", "Absence de croissance microbienne après 48 heures d'incubation"),
            text("count", "Numération (UFC/mL)", "/"),
          ],
        },
      ],
      conclusion: true,
      antibiogram: true,
    },
  },
  {
    id: "pcv",
    name: "PCV (prélèvement cervico-vaginal)",
    bench: "Bactériologie",
    template: {
      version: 1,
      title: "ANALYSE CYTOBACTÉRIOLOGIQUE DES PRÉLÈVEMENTS GÉNITAUX",
      sections: [
        { title: "Examen macroscopique", fields: [text("discharge", "Aspect des leucorrhées", "Peu abondantes, blanchâtres"), text("cervix", "Aspect du col", "Normal")] },
        {
          title: "État frais",
          fields: [
            presence("epith", "Cellules épithéliales", true),
            presence("leuco", "Leucocytes"),
            presence("rbc", "Hématies", true),
            presence("yeast", "Levures", true),
            presence("tricho", "Trichomonas vaginalis"),
          ],
        },
        {
          title: "Coloration de Gram",
          fields: [
            presence("bgp", "Bacilles à Gram positif"),
            presence("bgn", "Bacilles à Gram négatif"),
            presence("coccobacilli", "Coccobacilles à Gram variable"),
            choice("clue", "Clue cells", ["Absentes", "Présentes"], { default: "Absentes", abnormal: ["Présentes"] }),
            presence("cgp", "Cocci à Gram positif"),
            presence("neisseria", "Diplocoques (Neisseria)"),
            choice("flora", "Flore", ["Type I", "Type II", "Type III", "Type IV"], { default: "Type I", abnormal: ["Type III", "Type IV"] }),
          ],
        },
        { title: "Culture", fields: [text("culture", "Culture", "Négative")] },
      ],
      conclusion: true,
      antibiogram: true,
      antifungigram: true,
    },
  },
  {
    id: "coproculture",
    name: "Coproculture",
    bench: "Bactériologie",
    template: {
      version: 1,
      title: "COPROCULTURE",
      sections: [
        { title: "Examen macroscopique", fields: [text("aspect", "Aspect", "Selles molles")] },
        {
          title: "Examen microscopique",
          fields: [
            presence("leuco", "Leucocytes"),
            presence("rbc", "Hématies", true),
            presence("yeast", "Levures", true),
            text("cysts", "Kystes / œufs de parasites", "Absents"),
            text("flora", "Flore bactérienne", "Normale"),
          ],
        },
        { title: "Coloration de Gram", fields: [text("gram", "Répartition", "Bacilles à Gram négatif : 60 % ; autres : 40 %")] },
        { title: "Culture", fields: [text("culture", "Culture", "Recherche négative de Salmonella spp et Shigella spp")] },
      ],
      conclusion: true,
      antibiogram: true,
      antifungigram: true,
    },
  },
  ...extraPresets(),
];

// Modèles ajoutés pour couvrir le catalogue courant d'un laboratoire de clinique (biochimie,
// hémostase, sérologies, bactériologie, hormonologie). Valeurs de référence adulte usuelles,
// indicatives : à ajuster par le biologiste selon les réactifs et automates du laboratoire.
function extraPresets(): TemplatePreset[] {
  const table = (fields: ResultField[], extra: Partial<ResultTemplate> = {}): ResultTemplate => ({ version: 1, sections: [{ layout: "table", fields }], ...extra });
  const igmIgg = (id: string, name: string): TemplatePreset => ({
    id,
    name,
    bench: "Sérologie",
    template: {
      version: 1,
      sections: [
        {
          fields: [
            choice("igm", "IgM", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
            choice("igg", "IgG", NEG_POS, { default: "Négatif" }),
          ],
        },
      ],
      conclusion: true,
    },
  });
  const hormone = (id: string, name: string, unit: string, refText: string, refLow?: number, refHigh?: number): TemplatePreset => ({
    id,
    name,
    bench: "Hormonologie",
    template: table([num(id, name, unit, refLow, refHigh, refText)], { technique: "Immunodosage" }),
  });
  const presenceSection = (title: string, fields: ResultField[]) => ({ title, fields });

  return [
    // --- Biochimie ---
    { id: "asat", name: "ASAT (TGO)", bench: "Biochimie", template: table([num("asat", "ASAT (TGO)", "UI/L", 0, 40)]) },
    { id: "alat", name: "ALAT (TGP)", bench: "Biochimie", template: table([num("alat", "ALAT (TGP)", "UI/L", 0, 40)]) },
    { id: "urea", name: "Urée", bench: "Biochimie", template: table([num("urea", "Urée", "g/L", 0.15, 0.45)]) },
    { id: "creatinine", name: "Créatinine", bench: "Biochimie", template: table([num("creat", "Créatinine", "mg/L", 6, 13, "H : 7 – 13 ; F : 6 – 11")]) },
    { id: "ggt", name: "Gamma-GT", bench: "Biochimie", template: table([num("ggt", "Gamma-GT", "UI/L", undefined, 55, "H < 55 ; F < 38")]) },
    {
      id: "bilirubin",
      name: "Bilirubine (totale / directe)",
      bench: "Biochimie",
      template: table([
        num("total", "Bilirubine totale", "mg/L", undefined, 12, "< 12"),
        num("direct", "Bilirubine directe (conjuguée)", "mg/L", undefined, 3, "< 3"),
        num("indirect", "Bilirubine indirecte (libre)", "mg/L", undefined, 9, "< 9"),
      ]),
    },
    {
      id: "iono-simple",
      name: "Ionogramme simple",
      bench: "Biochimie",
      template: table([num("na", "Sodium (Na⁺)", "mmol/L", 135, 145), num("k", "Potassium (K⁺)", "mmol/L", 3.5, 5), num("cl", "Chlore (Cl⁻)", "mmol/L", 98, 107)]),
    },
    {
      id: "iono-complet",
      name: "Ionogramme complet",
      bench: "Biochimie",
      template: table([
        num("na", "Sodium (Na⁺)", "mmol/L", 135, 145),
        num("k", "Potassium (K⁺)", "mmol/L", 3.5, 5),
        num("cl", "Chlore (Cl⁻)", "mmol/L", 98, 107),
        num("hco3", "Bicarbonates (HCO₃⁻)", "mmol/L", 22, 29),
        num("ca", "Calcium", "mmol/L", 2.2, 2.6),
        num("mg", "Magnésium", "mmol/L", 0.7, 1.05),
        num("p", "Phosphore", "mmol/L", 0.8, 1.45),
      ]),
    },
    {
      id: "lipid-profile",
      name: "Profil lipidique",
      bench: "Biochimie",
      template: table([
        num("chol", "Cholestérol total", "g/L", undefined, 2, "< 2,00"),
        num("hdl", "HDL-cholestérol", "g/L", 0.4, undefined, "> 0,40"),
        num("ldl", "LDL-cholestérol", "g/L", undefined, 1.6, "< 1,60"),
        num("tg", "Triglycérides", "g/L", undefined, 1.5, "< 1,50"),
        num("ratio", "Rapport CT / HDL", undefined, undefined, 5, "< 5"),
      ]),
    },
    { id: "hba1c", name: "Hémoglobine glyquée (HbA1c)", bench: "Biochimie", template: table([num("hba1c", "HbA1c", "%", 4, 6, "4 – 6 (objectif du diabétique < 7)")]) },

    // --- Hématologie / hémostase ---
    {
      id: "tp-inr",
      name: "TP / INR (taux de prothrombine)",
      bench: "Hématologie",
      template: table([
        num("patient", "Temps du patient", "s"),
        num("control", "Temps du témoin", "s"),
        num("tp", "Taux de prothrombine (TP)", "%", 70, 100),
        num("inr", "INR", undefined, 0.8, 1.2, "0,8 – 1,2 (hors traitement anticoagulant)"),
      ]),
    },
    {
      id: "tck",
      name: "TCK (temps de céphaline activée)",
      bench: "Hématologie",
      template: table([num("patient", "Temps du patient", "s"), num("control", "Temps du témoin", "s"), num("ratio", "Rapport patient / témoin", undefined, undefined, 1.2, "< 1,2")]),
    },
    {
      id: "esr",
      name: "VS (vitesse de sédimentation)",
      bench: "Hématologie",
      template: table([num("h1", "1re heure", "mm", undefined, 20, "H < 15 ; F < 20"), num("h2", "2e heure", "mm")], { technique: "Méthode de Westergren" }),
    },
    { id: "bleeding-time", name: "TS (temps de saignement)", bench: "Hématologie", template: table([num("ts", "Temps de saignement", "min", 2, 4)], { technique: "Méthode de Duke" }) },
    { id: "clotting-time", name: "TC (temps de coagulation)", bench: "Hématologie", template: table([num("tc", "Temps de coagulation", "min", 5, 10)], { technique: "Méthode de Lee et White" }) },
    { id: "hemoglobin", name: "Taux d'hémoglobine", bench: "Hématologie", template: table([num("hb", "Hémoglobine", "g/dL", 12, 17, "H : 13 – 17 ; F : 12 – 16")]) },

    // --- Parasitologie ---
    {
      id: "microfilaria",
      name: "Recherche de microfilaires",
      bench: "Parasitologie",
      template: {
        version: 1,
        technique: "Frottis / leucoconcentration, coloration au Giemsa",
        sections: [
          {
            fields: [
              choice("result", "Résultat", NEG_POS, { default: "Négatif", abnormal: ["Positif"] }),
              choice("species", "Espèce", ["/", "Loa loa", "Mansonella perstans", "Wuchereria bancrofti", "Autre"], { default: "/" }),
              num("density", "Densité", "microfilaires/mL"),
            ],
          },
        ],
        conclusion: true,
      },
    },

    // --- Sérologie ---
    {
      id: "malaria-rdt",
      name: "TDR paludisme",
      bench: "Sérologie",
      template: rapidTest("rdt", "TDR paludisme (antigène HRP2 / pLDH)", "Test de diagnostic rapide", ["Négatif", "Positif"], "Positif"),
    },
    {
      id: "pregnancy-test",
      name: "Test de grossesse (β-hCG urinaire)",
      bench: "Sérologie",
      template: { version: 1, technique: "Test rapide immunochromatographique", sections: [{ fields: [choice("hcg", "β-hCG urinaire", NEG_POS, { default: "Négatif" })] }], conclusion: true },
    },
    {
      id: "chlamydia-rapid",
      name: "Chlamydia trachomatis (test rapide)",
      bench: "Sérologie",
      template: rapidTest("chlamydia", "Chlamydia trachomatis", "Test rapide", ["Négatif", "Positif"], "Positif"),
    },
    igmIgg("igm-igg-hsv1", "Herpès type 1 (HSV 1) (IgM / IgG)"),
    igmIgg("igm-igg-hsv2", "Herpès type 2 (HSV 2) (IgM / IgG)"),

    // --- Bactériologie ---
    {
      id: "mycoplasma",
      name: "Mycoplasmes urogénitaux",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "RECHERCHE DE MYCOPLASMES UROGÉNITAUX",
        sections: [
          {
            layout: "table",
            fields: [
              choice("uu", "Ureaplasma urealyticum", ["Négatif", "Positif < 10⁴ UCC/mL", "Positif ≥ 10⁴ UCC/mL"], { default: "Négatif", abnormal: ["Positif ≥ 10⁴ UCC/mL"] }),
              choice("mh", "Mycoplasma hominis", ["Négatif", "Positif < 10⁴ UCC/mL", "Positif ≥ 10⁴ UCC/mL"], { default: "Négatif", abnormal: ["Positif ≥ 10⁴ UCC/mL"] }),
            ],
          },
        ],
        conclusion: true,
        antibiogram: true,
      },
    },
    {
      id: "spermogram",
      name: "Spermogramme",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "SPERMOGRAMME",
        sections: [
          { title: "Renseignements", fields: [text("abstinence", "Délai d'abstinence", "3 jours")] },
          {
            title: "Examen macroscopique",
            layout: "table",
            fields: [
              num("volume", "Volume", "mL", 1.5, undefined, "≥ 1,5"),
              num("ph", "pH", undefined, 7.2, 8),
              choice("viscosity", "Viscosité", ["Normale", "Augmentée"], { default: "Normale", abnormal: ["Augmentée"] }),
              text("liquefaction", "Liquéfaction", "Complète en 30 min"),
              text("color", "Aspect / couleur", "Blanc opalescent"),
            ],
          },
          {
            title: "Examen microscopique",
            layout: "table",
            fields: [
              num("concentration", "Numération", "millions/mL", 15, undefined, "≥ 15"),
              num("total", "Numération totale", "millions/éjaculat", 39, undefined, "≥ 39"),
              num("progressive", "Mobilité progressive", "%", 32, undefined, "≥ 32"),
              num("motility", "Mobilité totale", "%", 40, undefined, "≥ 40"),
              num("vitality", "Vitalité", "%", 58, undefined, "≥ 58"),
              num("morphology", "Formes normales", "%", 4, undefined, "≥ 4"),
              num("leuco", "Leucocytes", "millions/mL", undefined, 1, "< 1"),
              choice("agglutination", "Agglutinats", ["Absents", "Présents"], { default: "Absents", abnormal: ["Présents"] }),
            ],
          },
        ],
        conclusion: true,
        note: "Valeurs de référence OMS 2010.",
      },
    },
    {
      id: "spermoculture",
      name: "Spermoculture",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "SPERMOCULTURE",
        sections: [
          presenceSection("Examen microscopique", [presence("leuco", "Leucocytes"), presence("rbc", "Hématies", true), presence("yeast", "Levures", true), text("other", "Autres éléments", "/")]),
          presenceSection("Coloration de Gram", [presence("bgp", "Bacilles à Gram positif"), presence("bgn", "Bacilles à Gram négatif"), presence("cgp", "Cocci à Gram positif")]),
          { title: "Culture", fields: [text("culture", "Culture", "Absence de croissance microbienne"), text("count", "Numération (UFC/mL)", "/")] },
        ],
        conclusion: true,
        antibiogram: true,
      },
    },
    {
      id: "urethral-swab",
      name: "PU (prélèvement urétral)",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "PRÉLÈVEMENT URÉTRAL",
        sections: [
          { title: "Examen macroscopique", fields: [text("discharge", "Écoulement", "Absent")] },
          presenceSection("État frais", [presence("leuco", "Leucocytes"), presence("rbc", "Hématies", true), presence("yeast", "Levures", true), presence("tricho", "Trichomonas vaginalis")]),
          presenceSection("Coloration de Gram", [
            presence("neisseria", "Diplocoques à Gram négatif intracellulaires"),
            presence("bgn", "Bacilles à Gram négatif"),
            presence("cgp", "Cocci à Gram positif"),
            presence("bgp", "Bacilles à Gram positif"),
          ]),
          { title: "Culture", fields: [text("culture", "Culture", "Négative")] },
        ],
        conclusion: true,
        antibiogram: true,
      },
    },
    {
      id: "pus",
      name: "Pus / plaie (examen cytobactériologique)",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "EXAMEN CYTOBACTÉRIOLOGIQUE DU PUS",
        sections: [
          { title: "Prélèvement", fields: [text("site", "Site", "/"), text("aspect", "Aspect", "Purulent")] },
          presenceSection("Examen microscopique", [presence("leuco", "Leucocytes"), presence("rbc", "Hématies", true)]),
          presenceSection("Coloration de Gram", [presence("cgp", "Cocci à Gram positif"), presence("bgn", "Bacilles à Gram négatif"), presence("bgp", "Bacilles à Gram positif")]),
          { title: "Culture", fields: [text("culture", "Culture", "Négative")] },
        ],
        conclusion: true,
        antibiogram: true,
      },
    },
    {
      id: "blood-culture",
      name: "Hémoculture",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "HÉMOCULTURE",
        sections: [
          { title: "Prélèvement", fields: [text("bottles", "Flacons", "1 aérobie + 1 anaérobie"), text("temperature", "Température au prélèvement", "/")] },
          { title: "Résultat", fields: [text("gram", "Examen direct (Gram)", "/"), text("culture", "Culture", "Absence de croissance après 7 jours d'incubation")] },
        ],
        conclusion: true,
        antibiogram: true,
      },
    },

    {
      id: "catheter-tip",
      name: "Bout de sonde / cathéter (culture)",
      bench: "Bactériologie",
      template: {
        version: 1,
        title: "CULTURE DE BOUT DE SONDE / CATHÉTER",
        sections: [
          {
            title: "Prélèvement",
            fields: [
              choice("device", "Matériel", ["Sonde urinaire", "Cathéter veineux périphérique", "Cathéter veineux central", "Sonde d'intubation", "Drain", "Autre"], { default: "Sonde urinaire" }),
              text("length", "Longueur reçue", "/"),
            ],
          },
          { title: "Examen direct", fields: [text("gram", "Coloration de Gram", "Absence de germes")] },
          {
            title: "Culture",
            fields: [
              choice("method", "Méthode", ["Brun-Buisson (quantitative)", "Maki (semi-quantitative)"], { default: "Brun-Buisson (quantitative)" }),
              text("culture", "Culture", "Absence de croissance microbienne après 48 heures d'incubation"),
              text("count", "Numération", "/", false),
            ],
          },
        ],
        conclusion: true,
        antibiogram: true,
        antifungigram: true,
        note: "Culture significative : ≥ 10³ UFC/mL (Brun-Buisson) ou ≥ 15 colonies (Maki).",
      },
    },

    // --- Hormonologie ---
    hormone("lh", "LH", "mUI/mL", "H : 1,7 – 8,6 ; F : variable selon la phase du cycle"),
    hormone("fsh", "FSH", "mUI/mL", "H : 1,5 – 12,4 ; F : variable selon la phase du cycle"),
    hormone("tsh", "TSH", "µUI/mL", "0,27 – 4,2", 0.27, 4.2),
    hormone("t4", "T4 libre", "pmol/L", "12 – 22", 12, 22),
    hormone("t3", "T3 libre", "pmol/L", "3,1 – 6,8", 3.1, 6.8),
    hormone("testosterone", "Testostérone totale", "ng/mL", "H : 2,8 – 8,0 ; F : 0,06 – 0,82"),
    hormone("free-testosterone", "Testostérone libre", "pg/mL", "H : 8,7 – 25 ; F : < 4,1"),
    hormone("psa", "PSA total", "ng/mL", "< 4", undefined, 4),
    {
      id: "free-psa",
      name: "PSA libre",
      bench: "Hormonologie",
      template: table([num("free", "PSA libre", "ng/mL"), num("ratio", "Rapport PSA libre / total", "%", 25, undefined, "> 25")], { technique: "Immunodosage" }),
    },
    hormone("estradiol", "Oestradiol", "pg/mL", "F : variable selon la phase du cycle ; H : 11 – 44"),
    hormone("prolactin", "Prolactine", "ng/mL", "H : 4 – 15 ; F : 5 – 25"),
  ];
}

export function presetById(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.id === id);
}
