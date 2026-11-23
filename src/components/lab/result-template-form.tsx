"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ANTIBIOTICS,
  ANTIFUNGALS,
  SUSCEPTIBILITY_LABELS,
  isFieldAbnormal,
  referenceText,
  type ResultData,
  type ResultField,
  type ResultTemplate,
  type Susceptibility,
} from "@/lib/lab-templates";

const selectClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-base sm:h-9 sm:text-sm dark:border-slate-800 dark:bg-slate-900";

function FieldInput({ field, value, onChange }: { field: ResultField; value: string; onChange: (v: string) => void }) {
  const abnormal = isFieldAbnormal(field, value);
  const ring = abnormal ? "border-red-400 ring-1 ring-red-300 dark:border-red-700" : "";
  if (field.type === "choice") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${selectClass} ${ring}`}>
        <option value="">—</option>
        {/* Valeur hors liste (modèle modifié depuis) : gardée telle quelle. */}
        {value && !field.options.includes(value) && <option value={value}>{value}</option>}
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "text" && field.multiline) {
    return <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-16 rounded-xl text-base sm:text-sm" />;
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode={field.type === "number" ? "decimal" : undefined}
      className={`h-11 rounded-xl text-base sm:h-9 sm:text-sm ${ring}`}
    />
  );
}

function SusceptibilityGrid({
  title,
  drugs,
  value,
  onChange,
}: {
  title: string;
  drugs: string[];
  value: Record<string, Susceptibility>;
  onChange: (v: Record<string, Susceptibility>) => void;
}) {
  const set = (drug: string, s: Susceptibility | "") => {
    const next = { ...value };
    if (s) next[drug] = s;
    else delete next[drug];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="text-xs text-muted-foreground">Ne renseignez que les molécules testées.</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {drugs.map((drug) => (
          <div key={drug} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 px-2 py-1 dark:border-slate-800">
            <span className="text-xs">{drug}</span>
            <div className="flex gap-1">
              {(["S", "I", "R"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  title={SUSCEPTIBILITY_LABELS[s]}
                  onClick={() => set(drug, value[drug] === s ? "" : s)}
                  className={`h-8 w-8 rounded-md border text-xs font-bold sm:h-7 sm:w-7 ${
                    value[drug] === s
                      ? s === "S"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : s === "I"
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-red-500 bg-red-500 text-white"
                      : "border-slate-200 text-slate-500 dark:border-slate-700"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Saisie d'un compte rendu selon le modèle de l'examen : sections de champs, conclusion,
// antibiogramme / antifongigramme.
export default function ResultTemplateForm({
  template,
  data,
  onChange,
}: {
  template: ResultTemplate;
  data: ResultData;
  onChange: (data: ResultData) => void;
}) {
  const setValue = (key: string, v: string) => onChange({ ...data, values: { ...data.values, [key]: v } });

  return (
    <div className="space-y-4">
      {(template.title || template.technique) && (
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/50">
          {template.title && <p className="font-bold">{template.title}</p>}
          {template.technique && <p className="text-muted-foreground">Technique : {template.technique}</p>}
        </div>
      )}
      {template.sections.map((section, si) => (
        <div key={si} className="space-y-2">
          {section.title && <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{section.title}</p>}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {section.fields.map((field) => {
              const ref = referenceText(field);
              const unit = field.type !== "text" ? field.unit : undefined;
              return (
                <div key={field.key} className={`space-y-1 ${field.type === "text" && field.multiline ? "sm:col-span-2" : ""}`}>
                  <Label className="text-xs">
                    {field.label}
                    {unit && <span className="font-normal text-muted-foreground"> ({unit})</span>}
                    {ref && <span className="font-normal text-muted-foreground"> — réf. {ref}</span>}
                  </Label>
                  <FieldInput field={field} value={data.values[field.key] ?? ""} onChange={(v) => setValue(field.key, v)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(template.antibiogram || template.antifungigram) && (
        <div className="space-y-1">
          <Label className="text-xs">Germe(s) identifié(s)</Label>
          <Input
            value={data.germ ?? ""}
            onChange={(e) => onChange({ ...data, germ: e.target.value })}
            placeholder="ex: Candida albicans, Gardnerella vaginalis"
            className="h-11 rounded-xl text-base sm:h-9 sm:text-sm"
          />
        </div>
      )}
      {template.antibiogram && (
        <SusceptibilityGrid title="Antibiogramme" drugs={ANTIBIOTICS} value={data.antibiogram ?? {}} onChange={(v) => onChange({ ...data, antibiogram: v })} />
      )}
      {template.antifungigram && (
        <SusceptibilityGrid title="Antifongigramme" drugs={ANTIFUNGALS} value={data.antifungigram ?? {}} onChange={(v) => onChange({ ...data, antifungigram: v })} />
      )}

      {template.conclusion && (
        <div className="space-y-1">
          <Label className="text-xs">Conclusion</Label>
          <Textarea
            value={data.conclusion ?? ""}
            onChange={(e) => onChange({ ...data, conclusion: e.target.value })}
            placeholder="ex: Sérologie négative / Culture stérile / Présence de..."
            className="min-h-16 rounded-xl text-base sm:text-sm"
          />
        </div>
      )}
      {template.note && <p className="rounded-lg bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">N.B. : {template.note}</p>}
    </div>
  );
}
