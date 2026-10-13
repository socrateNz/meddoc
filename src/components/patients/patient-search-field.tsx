"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPatientsPage } from "@/actions/patient-list";

export type FoundPatient = { id: string; name: string; ipp: string | null; bloodType?: string | null };

// Recherche d'un patient de la clinique (nom, IPP, téléphone), avec debounce — mêmes critères que
// la liste des patients. À placer HORS d'un <form> parent si on y ajoute une création sur place.
export default function PatientSearchField({
  clinicId,
  value,
  onChange,
  autoFocus,
}: {
  clinicId: string;
  value: FoundPatient | null;
  onChange: (patient: FoundPatient | null) => void;
  autoFocus?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoundPatient[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (value || term.length < 2) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setSearching(true);
      const res = await listPatientsPage({ organizationId: clinicId, search: term, page: 1 });
      if (cancelled) return;
      setSearching(false);
      setResults(
        res.success
          ? res.data.map((p) => ({ id: p.id, name: `${p.user.lastName} ${p.user.firstName}`, ipp: p.ipp ?? null, bloodType: p.bloodType ?? null }))
          : []
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, value, clinicId]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{value.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{[value.ipp, value.bloodType && `Groupe ${value.bloodType}`].filter(Boolean).join(" • ")}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Changer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input autoFocus={autoFocus} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, IPP ou téléphone..." className="pl-9 rounded-xl" />
        {searching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
      </div>
      {search.trim().length >= 2 && !searching && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {results.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Aucun patient trouvé.</p>
          ) : (
            results.map((r) => (
              <button key={r.id} type="button" onClick={() => onChange(r)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="text-sm font-medium">{r.name}</span>
                {r.ipp && <span className="ml-2 text-xs font-mono text-muted-foreground">{r.ipp}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
