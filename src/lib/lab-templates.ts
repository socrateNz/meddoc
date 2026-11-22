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
export const LAB_BENCHES = ["Biochimie", "Hématologie", "Sérologie", "Immunologie", "Parasitologie", "Bactériologie"];

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
];

export function presetById(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.id === id);
}
