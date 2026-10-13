"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { updateHoldingModules } from "@/actions/super-admin";
import { MODULES, MODULE_KEYS, PLAN_MODULES, enabledModulesFrom, withRequirements, type ModuleKey } from "@/lib/modules";

const PLAN_LABELS: Record<string, string> = { BASIC: "Basique", PREMIUM: "Premium", ENTERPRISE: "Entreprise" };

// Modules de la licence d'une holding (SUPER_ADMIN uniquement). Les plans servent de préréglages ;
// les prérequis sont cochés d'office (Urgences entraîne Accueil).
export default function HoldingModulesDialog({
  holding,
  open,
  onOpenChange,
}: {
  holding: { id: string; name: string; disabledModules?: string[] | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ModuleKey[]>(() => enabledModulesFrom(holding.disabledModules));
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const effective = withRequirements(selected);
  const toggle = (key: ModuleKey) => {
    setWarnings(null);
    setSelected((cur) => {
      if (!cur.includes(key)) return [...cur, key];
      // Retirer un module retire aussi ceux qui en dépendent.
      return cur.filter((k) => k !== key && !MODULES[k].requires.includes(key));
    });
  };

  const save = async (confirm = false) => {
    setSaving(true);
    const res = await updateHoldingModules({ holdingId: holding.id, enabledModules: effective, confirm });
    setSaving(false);
    if (res.success) {
      toast.success("Modules de la licence mis à jour.");
      setWarnings(null);
      onOpenChange(false);
      router.refresh();
    } else if ("needsConfirmation" in res) {
      setWarnings(res.warnings ?? []);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modules de la licence — {holding.name}</DialogTitle>
          <DialogDescription>
            S&apos;appliquent à toutes les cliniques de la holding. Le socle (patients, dossier, rendez-vous, ordonnances, caisse, finance, équipe, messagerie) est toujours inclus. Retirer un
            module masque ses écrans sans effacer ses données.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Préréglage :</span>
          {Object.entries(PLAN_LABELS).map(([plan, label]) => (
            <Button key={plan} size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setWarnings(null); setSelected(PLAN_MODULES[plan]); }}>
              {label}
            </Button>
          ))}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
          {MODULE_KEYS.map((key) => {
            const mod = MODULES[key];
            const checked = effective.includes(key);
            const forced = checked && !selected.includes(key);
            return (
              <label key={key} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <input type="checkbox" checked={checked} disabled={forced} onChange={() => toggle(key)} className="mt-1 h-4 w-4" />
                <span className="min-w-0">
                  <span className="text-sm font-semibold">{mod.label}</span>
                  {mod.requires.length > 0 && <span className="text-[11px] text-muted-foreground"> — nécessite {mod.requires.map((r) => MODULES[r].label).join(", ")}</span>}
                  {forced && <span className="text-[11px] text-blue-600"> (requis par un module coché)</span>}
                  <span className="block text-xs text-muted-foreground">{mod.description}</span>
                </span>
              </label>
            );
          })}
        </div>

        {warnings && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Du travail est en cours dans les modules retirés :
            </p>
            <ul className="list-disc pl-5 text-xs space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="text-xs">Ces éléments deviendront invisibles jusqu&apos;à la réactivation du module.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={saving} onClick={() => save(!!warnings)} className={warnings ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {warnings ? "Confirmer malgré tout" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
