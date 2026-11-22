import { isFieldAbnormal, referenceText, SUSCEPTIBILITY_LABELS, type StoredResultData, type Susceptibility } from "@/lib/lab-templates";

function SusceptibilityTable({ title, values }: { title: string; values: Record<string, Susceptibility> }) {
  const by = (s: Susceptibility) => Object.entries(values).filter(([, v]) => v === s).map(([d]) => d);
  if (Object.keys(values).length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold uppercase text-slate-500">{title}</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {(["S", "I", "R"] as const).map((s) => (
          <div key={s} className="rounded-lg border border-slate-200/70 p-2 dark:border-slate-800">
            <p className={`mb-1 font-semibold ${s === "S" ? "text-emerald-600" : s === "I" ? "text-amber-600" : "text-red-600"}`}>{SUSCEPTIBILITY_LABELS[s]}</p>
            {by(s).map((d) => (
              <p key={d}>{d}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Affichage d'un compte rendu structuré dans la fiche de la demande.
export default function StructuredResultView({ result }: { result: StoredResultData }) {
  const { template } = result;
  return (
    <div className="space-y-2 text-sm">
      {template.technique && <p className="text-xs text-muted-foreground">Technique : {template.technique}</p>}
      {template.sections.map((section, si) => {
        const rows = section.fields.filter((f) => (result.values[f.key] ?? "").trim() !== "");
        if (rows.length === 0) return null;
        return (
          <div key={si}>
            {section.title && <p className="text-[11px] font-bold uppercase text-slate-500">{section.title}</p>}
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {rows.map((f) => {
                const v = result.values[f.key];
                const abnormal = isFieldAbnormal(f, v);
                const unit = f.type !== "text" && f.unit ? ` ${f.unit}` : "";
                const ref = referenceText(f);
                return (
                  <p key={f.key} className="flex justify-between gap-2 border-b border-dashed border-slate-200 py-0.5 dark:border-slate-800">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className={abnormal ? "font-bold text-red-600" : "font-medium"}>
                      {v}
                      {unit}
                      {ref && <span className="ml-1 text-[10px] font-normal text-muted-foreground">({ref})</span>}
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        );
      })}
      {result.germ && (
        <p>
          <span className="text-muted-foreground">Germe(s) identifié(s) : </span>
          <span className="font-medium italic">{result.germ}</span>
        </p>
      )}
      {result.antibiogram && <SusceptibilityTable title="Antibiogramme" values={result.antibiogram} />}
      {result.antifungigram && <SusceptibilityTable title="Antifongigramme" values={result.antifungigram} />}
      {result.conclusion && (
        <p>
          <span className="font-semibold">Conclusion : </span>
          {result.conclusion}
        </p>
      )}
    </div>
  );
}
