"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Search, User as UserIcon, UserPlus } from "lucide-react";
import { searchPatientsForShare } from "@/actions/messages";

export interface SharePatientOption {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date;
}

interface AttachPatientDialogProps {
  organizationId: string | null;
  onSelect: (patient: SharePatientOption) => void;
}

function calculateAge(dateOfBirth: string | Date) {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Bouton + dialogue "Partager un dossier patient" du composeur — recherche à la frappe côté
// serveur (searchPatientsForShare) plutôt qu'un répertoire complet chargé d'avance sur la page
// messagerie : un établissement peut compter des centaines de patients, inutile de tous les
// transmettre tant que personne n'ouvre ce dialogue. N'est rendu du tout par chat-panel.tsx que si
// canSharePatient(currentUser.role) côté serveur (même contrôle refait par l'action elle-même).
export default function AttachPatientDialog({ organizationId, onSelect }: AttachPatientDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SharePatientOption[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // setLoading(true) se fait DANS le timeout (pas en tête d'effet) : un appel setState
    // synchrone dans le corps même de l'effet déclenche un rendu en cascade inutile (règle
    // react-hooks/set-state-in-effect) — ici il est de toute façon légitimement différé par le
    // debounce, pas besoin de l'anticiper.
    const timeout = setTimeout(async () => {
      setLoading(true);
      const res = await searchPatientsForShare(query, organizationId || undefined);
      if (cancelled) return;
      setResults(res.success ? ((res.data as any[]) || []).map((p) => ({ id: p.id, firstName: p.user.firstName, lastName: p.user.lastName, dateOfBirth: p.dateOfBirth })) : []);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [open, query, organizationId]);

  const handleSelect = (patient: SharePatientOption) => {
    onSelect(patient);
    setOpen(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" title="Partager un dossier patient" />}
      >
        <UserPlus className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="bg-card border shadow-2xl rounded-2xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Partager un dossier patient
          </DialogTitle>
          <DialogDescription>Le destinataire verra une carte avec un lien direct vers le dossier.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom..."
              className="pl-9"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto space-y-1">
            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {query.trim() ? "Aucun patient ne correspond." : "Tapez un nom pour rechercher."}
              </p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-muted/60 transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{p.lastName} {p.firstName}</p>
                    <p className="text-xs text-muted-foreground">{calculateAge(p.dateOfBirth)} ans</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
