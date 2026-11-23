"use client";

import SearchSelect from "@/components/ui/search-select";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, History, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listClinicServices, transferPatient } from "@/actions/clinic-services";
import { toast } from "sonner";

type Transfer = {
  id: string;
  kind: string;
  reason: string | null;
  createdAt: string | Date;
  fromService: { name: string } | null;
  toService: { name: string };
};

function formatDate(d: string | Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

// Service qui a la charge du dossier, transfert vers un autre service et historique.
export default function PatientServicePanel({
  patientId,
  patientName,
  clinicId,
  service,
  transfers,
  canTransfer,
}: {
  patientId: string;
  patientName: string;
  clinicId: string | null;
  service: { id: string; name: string } | null;
  transfers: Transfer[];
  canTransfer: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<{ id: string; name: string }[] | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!open || !clinicId) return;
    let cancelled = false;
    listClinicServices(clinicId).then((res) => {
      if (!cancelled) setServices(res.success ? res.data.filter((s) => s.id !== service?.id).map((s) => ({ id: s.id, name: s.name })) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clinicId, service?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    const res = await transferPatient({ patientId, toServiceId: target, reason: reason.trim() || undefined });
    setSaving(false);
    if (res.success) {
      toast.success(`Dossier transféré en ${res.data.serviceName}.`);
      setOpen(false);
      setTarget("");
      setReason("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  // Clinique sans service et dossier jamais orienté : rien à afficher.
  if (!service && transfers.length === 0 && !canTransfer) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
        <Layers className="h-3 w-3" />
        {service ? service.name : "Aucun service"}
      </span>
      {canTransfer && clinicId && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" />}>
            <ArrowRightLeft className="h-3.5 w-3.5" />
            {service ? "Transférer" : "Confier à un service"}
          </DialogTrigger>
          <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-md sm:p-6">
            <DialogHeader>
              <DialogTitle>Transférer le dossier</DialogTitle>
              <DialogDescription>
                {patientName} {service ? `est suivi(e) en ${service.name}.` : "n'est suivi(e) par aucun service."} Le service choisi prendra le dossier
                en charge ; si vous n&apos;en faites pas partie, vous n&apos;y aurez plus accès.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-target">Nouveau service *</Label>
                {services === null ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : services.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun autre service actif dans cette clinique.</p>
                ) : (
                  <SearchSelect
                    id="transfer-target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    required
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base sm:h-10 sm:text-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="">Choisir…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SearchSelect>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-reason">Motif</Label>
                <Textarea id="transfer-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="ex: Avis ophtalmologique demandé" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving || !target} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Transférer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {transfers.length > 0 && (
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setShowHistory((v) => !v)}>
          <History className="h-3.5 w-3.5" />
          Historique ({transfers.length})
        </Button>
      )}
      {showHistory && (
        <ul className="w-full space-y-1 rounded-xl border border-slate-200/70 p-2 text-xs dark:border-slate-800">
          {transfers.map((t) => (
            <li key={t.id} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{formatDate(t.createdAt)}</span>
              <span className="font-medium">
                {t.kind === "ORIENTATION" ? "Orienté à l'accueil" : "Transféré"} : {t.fromService?.name ?? "aucun service"} → {t.toService.name}
              </span>
              {t.reason && <span className="text-muted-foreground">— {t.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
