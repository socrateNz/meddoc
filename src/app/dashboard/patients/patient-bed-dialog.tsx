"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedSingle, Loader2, LogOut } from "lucide-react";
import { assignPatientToBed, listAvailableBeds, releaseBed } from "@/actions/wards";

interface PatientBedDialogProps {
  clinicId: string;
  patientId: string;
  patientName: string;
  currentBed: { label: string; roomName: string } | null;
}

// Affecte un patient à un lit libre de la clinique, ou le transfère. L'ancien lit est libéré par le
// serveur dans la même opération ; « Libérer le lit » retire le patient de son lit.
export default function PatientBedDialog({ clinicId, patientId, patientName, currentBed }: PatientBedDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bedId, setBedId] = useState("");
  const [busy, setBusy] = useState(false);

  // La liste des lits libres est relue à CHAQUE ouverture (staleTime 0) : le cache partagé peut montrer
  // un lit pris entre-temps par un autre patient, ou un autre dialogue.
  const bedsKey = ["availableBeds", clinicId];
  const { data: beds = [], isLoading, isFetching } = useQuery({
    queryKey: bedsKey,
    queryFn: async () => {
      const res = await listAvailableBeds(clinicId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Toute affectation ou libération invalide la liste partagée : les autres dialogues la relisent à leur ouverture.
  const refreshBeds = () => queryClient.invalidateQueries({ queryKey: bedsKey });

  const options = beds.map((b) => ({ value: b.id, label: `${b.wardName} · ${b.roomName} · Lit ${b.label}` }));
  // Un lit choisi peut avoir été pris entre-temps : on ne le garde que s'il figure encore dans la liste fraîche.
  const chosenStillFree = options.some((o) => o.value === bedId);

  const assign = async () => {
    if (!bedId || !chosenStillFree) return;
    setBusy(true);
    try {
      const res = await assignPatientToBed({ patientId, bedId });
      if (!res.success) {
        toast.error(res.error || "Erreur lors de l'affectation du lit.");
        return;
      }
      toast.success(`${patientName} est affecté au lit.`);
      setOpen(false);
      setBedId("");
      router.refresh();
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setBusy(false);
      void refreshBeds();
    }
  };

  const release = async () => {
    setBusy(true);
    try {
      const res = await releaseBed(patientId);
      if (!res.success) {
        toast.error(res.error || "Erreur lors de la libération du lit.");
        return;
      }
      toast.success(`${patientName} n'occupe plus de lit.`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setBusy(false);
      void refreshBeds();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setBedId("");
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1 rounded-lg" title="Affecter ou changer de lit">
            <BedSingle className="h-3.5 w-3.5 text-emerald-600" />
            {currentBed ? `Lit ${currentBed.label}` : "Affecter un lit"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <BedSingle className="h-5 w-5 text-emerald-600" />
            Lit de {patientName}
          </DialogTitle>
          <DialogDescription>
            {currentBed
              ? `Actuellement : ${currentBed.roomName} · Lit ${currentBed.label}. Choisir un autre lit libère l'ancien.`
              : "Ce patient n'occupe pas de lit. Choisissez un lit libre de la clinique."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Lit libre</Label>
            <Select items={options} value={bedId} onValueChange={(v: any) => setBedId(v || "")}>
              <SelectTrigger className="w-full" disabled={isFetching}>
                <SelectValue placeholder={isLoading || isFetching ? "Mise à jour des lits…" : "Choisir un lit…"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bedId && !chosenStillFree && !isFetching && (
              <p className="text-[11px] text-red-600">Ce lit n&apos;est plus libre. Choisissez-en un autre.</p>
            )}
            {!isLoading && options.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Aucun lit libre dans cette clinique. Libérez un lit ou créez-en dans « Chambres &amp; Lits ».</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {currentBed ? (
            <Button type="button" variant="outline" onClick={release} disabled={busy} className="rounded-xl gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Libérer le lit
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="button" onClick={assign} disabled={busy || !chosenStillFree || isFetching} className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedSingle className="h-4 w-4" />}
              Affecter
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
