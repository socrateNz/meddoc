"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TEMPLATE_PRESETS, type ResultField, type ResultTemplate } from "@/lib/lab-templates";

const small = "h-9 rounded-lg text-sm";

function newKey(template: ResultTemplate) {
  const used = new Set(template.sections.flatMap((s) => s.fields.map((f) => f.key)));
  let i = used.size + 1;
  while (used.has(`f${i}`)) i++;
  return `f${i}`;
}

function toNum(v: string): number | undefined {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? undefined : n;
}

// Choix et ajustement du modèle de compte rendu d'un examen (catalogue) : partir d'un modèle prêt
// à l'emploi, puis modifier libellés, unités, valeurs de référence, listes de choix.
export default function ResultTemplateEditor({ value, onChange }: { value: ResultTemplate | null; onChange: (t: ResultTemplate | null) => void }) {
  const update = (fn: (t: ResultTemplate) => void) => {
    if (!value) return;
    const next = structuredClone(value);
    fn(next);
    onChange(next);
  };
  const setField = (si: number, fi: number, patch: Partial<ResultField> & { type?: ResultField["type"] }) =>
    update((t) => {
      const current = t.sections[si].fields[fi];
      const type = patch.type ?? current.type;
      const base = { key: current.key, label: patch.label ?? current.label };
      if (type === "number") {
        const c = current.type === "number" ? current : { key: current.key, label: current.label, type: "number" as const };
        t.sections[si].fields[fi] = { ...c, ...base, ...(patch as object), type: "number" } as ResultField;
      } else if (type === "choice") {
        const c = current.type === "choice" ? current : { ...base, type: "choice" as const, options: ["Négatif", "Positif"] };
        t.sections[si].fields[fi] = { ...c, ...base, ...(patch as object), type: "choice" } as ResultField;
      } else {
        const c = current.type === "text" ? current : { ...base, type: "text" as const };
        t.sections[si].fields[fi] = { ...c, ...base, ...(patch as object), type: "text" } as ResultField;
      }
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Modèle de compte rendu</p>
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id === "__none") onChange(null);
            else {
              const preset = TEMPLATE_PRESETS.find((p) => p.id === id);
              if (preset) onChange(structuredClone(preset.template));
            }
          }}
          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <option value="">{value ? "Remplacer par un autre modèle…" : "Saisie simple (une valeur) — choisir un modèle…"}</option>
          {value && <option value="__none">Aucun modèle (saisie simple)</option>}
          {[...new Set(TEMPLATE_PRESETS.map((p) => p.bench))].map((bench) => (
            <optgroup key={bench} label={bench}>
              {TEMPLATE_PRESETS.filter((p) => p.bench === bench).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">Partez d&apos;un modèle puis adaptez-le à vos réactifs et valeurs de référence.</p>
      </div>

      {value && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input className={small} placeholder="Titre du compte rendu (optionnel)" value={value.title ?? ""} onChange={(e) => update((t) => void (t.title = e.target.value || undefined))} />
            <Input className={small} placeholder="Technique (optionnel)" value={value.technique ?? ""} onChange={(e) => update((t) => void (t.technique = e.target.value || undefined))} />
          </div>

          {value.sections.map((section, si) => (
            <div key={si} className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Input
                  className={small}
                  placeholder="Titre de section (optionnel)"
                  value={section.title ?? ""}
                  onChange={(e) => update((t) => void (t.sections[si].title = e.target.value || undefined))}
                />
                <select
                  value={section.layout ?? "lines"}
                  onChange={(e) => update((t) => void (t.sections[si].layout = e.target.value as "table" | "lines"))}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                  title="Présentation sur le rapport"
                >
                  <option value="lines">Lignes</option>
                  <option value="table">Tableau</option>
                </select>
                {value.sections.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => update((t) => void t.sections.splice(si, 1))}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
              {section.fields.map((f, fi) => (
                <div key={f.key} className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex gap-2">
                    <Input className={small} value={f.label} onChange={(e) => setField(si, fi, { label: e.target.value })} placeholder="Paramètre" />
                    <select
                      value={f.type}
                      onChange={(e) => setField(si, fi, { type: e.target.value as ResultField["type"] })}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <option value="number">Chiffre</option>
                      <option value="choice">Choix</option>
                      <option value="text">Texte</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled={section.fields.length === 1}
                      onClick={() => update((t) => void t.sections[si].fields.splice(fi, 1))}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  {f.type === "number" && (
                    <div className="grid grid-cols-4 gap-1.5">
                      <Input className={small} placeholder="Unité" value={f.unit ?? ""} onChange={(e) => setField(si, fi, { unit: e.target.value || undefined })} />
                      <Input className={small} placeholder="Min" inputMode="decimal" value={f.refLow ?? ""} onChange={(e) => setField(si, fi, { refLow: toNum(e.target.value) })} />
                      <Input className={small} placeholder="Max" inputMode="decimal" value={f.refHigh ?? ""} onChange={(e) => setField(si, fi, { refHigh: toNum(e.target.value) })} />
                      <Input className={small} placeholder="Réf. texte" value={f.refText ?? ""} onChange={(e) => setField(si, fi, { refText: e.target.value || undefined })} />
                    </div>
                  )}
                  {f.type === "choice" && (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      <Input
                        className={`${small} sm:col-span-2`}
                        placeholder="Choix séparés par des virgules"
                        key={`opts-${f.options.join("|")}`}
                        defaultValue={f.options.join(", ")}
                        onBlur={(e) => {
                          const options = e.target.value.split(",").map((o) => o.trim()).filter(Boolean);
                          if (options.length) setField(si, fi, { options });
                        }}
                      />
                      <Input
                        className={small}
                        placeholder="Anormaux (virgules)"
                        key={`abn-${(f.abnormal ?? []).join("|")}`}
                        defaultValue={(f.abnormal ?? []).join(", ")}
                        onBlur={(e) => setField(si, fi, { abnormal: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                      />
                    </div>
                  )}
                  {f.type !== "number" && (
                    <Input className={small} placeholder="Valeur par défaut" value={f.default ?? ""} onChange={(e) => setField(si, fi, { default: e.target.value || undefined })} />
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => update((t) => void t.sections[si].fields.push({ key: newKey(t), label: "Nouveau paramètre", type: "number" }))}
              >
                <Plus className="h-3.5 w-3.5" />
                Paramètre
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => update((t) => void t.sections.push({ fields: [{ key: newKey(t), label: "Nouveau paramètre", type: "text" }] }))}
          >
            <Plus className="h-3.5 w-3.5" />
            Section
          </Button>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {(
              [
                ["conclusion", "Conclusion"],
                ["antibiogram", "Antibiogramme"],
                ["antifungigram", "Antifongigramme"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!value[k]} onChange={(e) => update((t) => void (t[k] = e.target.checked || undefined))} />
                {label}
              </label>
            ))}
          </div>
          <Input className={small} placeholder="Note fixe en bas du compte rendu (N.B., optionnel)" value={value.note ?? ""} onChange={(e) => update((t) => void (t.note = e.target.value || undefined))} />
        </div>
      )}
    </div>
  );
}
