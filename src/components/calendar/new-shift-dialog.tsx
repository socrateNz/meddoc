"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Briefcase, Trash2 } from "lucide-react";
import { createShift, updateShift, deleteShift } from "@/actions/shifts";
import { toast } from "sonner";
import { StaffUser } from "./types";

// Une seule unité de temps locale (<input type="date"/time">) -> ISO, même convention que
// new-appointment-modal.tsx.
function toLocalDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}
function toLocalTimeStr(d: Date) {
  return d.toISOString().split("T")[1].slice(0, 5);
}

export interface ShiftRecord {
  id: string;
  userId: string;
  title: string;
  startAt: string | Date;
  endAt: string | Date;
  notes?: string | null;
}

interface NewShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffUsers: StaffUser[];
  shift?: ShiftRecord | null;
  defaultDate?: string;
  onSuccess?: () => void;
}

// Dialogue "upsert" unique (création sans `shift`, édition+suppression avec) plutôt que deux
// fichiers séparés — contrairement aux rendez-vous, une garde n'a pas besoin d'un historique
// clinique (consultation/ordonnance) justifiant une vue détail dédiée (cf.
// appointment-detail-dialog.tsx) : ce formulaire simple suffit dans les deux cas.
//
// Le formulaire n'est monté QUE pendant que le dialogue est ouvert, avec une key dérivée de
// shift?.id : React réinitialise alors tout son état depuis les props à chaque nouvelle
// ouverture (nouvelle garde, ou garde différente à éditer) via le useState initial lui-même,
// sans jamais appeler de setState depuis un effet (cf. new-appointment-modal.tsx, qui a ce
// problème — on ne le reproduit pas ici).
export default function NewShiftDialog({ open, onOpenChange, staffUsers, shift, defaultDate, onSuccess }: NewShiftDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-card border border-border/60 shadow-2xl rounded-2xl">
        {open && (
          <ShiftForm
            key={shift?.id ?? "new"}
            staffUsers={staffUsers}
            shift={shift}
            defaultDate={defaultDate}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ShiftFormProps {
  staffUsers: StaffUser[];
  shift?: ShiftRecord | null;
  defaultDate?: string;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function ShiftForm({ staffUsers, shift, defaultDate, onOpenChange, onSuccess }: ShiftFormProps) {
  const isEdit = !!shift;
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const shiftStart = shift ? new Date(shift.startAt) : null;
  const shiftEnd = shift ? new Date(shift.endAt) : null;
  const day = defaultDate || toLocalDateStr(new Date());

  const [userId, setUserId] = useState(shift?.userId ?? "");
  const [title, setTitle] = useState(shift?.title ?? "");
  const [startDate, setStartDate] = useState(shiftStart ? toLocalDateStr(shiftStart) : day);
  const [startTime, setStartTime] = useState(shiftStart ? toLocalTimeStr(shiftStart) : "08:00");
  const [endDate, setEndDate] = useState(shiftEnd ? toLocalDateStr(shiftEnd) : day);
  const [endTime, setEndTime] = useState(shiftEnd ? toLocalTimeStr(shiftEnd) : "16:00");
  const [notes, setNotes] = useState(shift?.notes || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !title || !startDate || !startTime || !endDate || !endTime) {
      toast.error("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const startAt = new Date(`${startDate}T${startTime}`).toISOString();
      const endAt = new Date(`${endDate}T${endTime}`).toISOString();

      const response = isEdit
        ? await updateShift({ id: shift!.id, userId, title, startAt, endAt, notes: notes || undefined })
        : await createShift({ userId, title, startAt, endAt, notes: notes || undefined });

      if (response.success) {
        toast.success(isEdit ? "Garde mise à jour." : "Garde planifiée.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(response.error || "Erreur lors de l'enregistrement.");
      }
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!shift) return;
    setDeleteLoading(true);
    try {
      const response = await deleteShift(shift.id);
      if (response.success) {
        toast.success("Garde supprimée.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(response.error || "Erreur lors de la suppression.");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold tracking-tight">
              {isEdit ? "Modifier la garde" : "Nouvelle garde"}
            </DialogTitle>
            <DialogDescription>Planifiez un créneau de garde pour un membre du personnel.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 pt-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Membre du personnel *</Label>
          <Select onValueChange={(val) => val && setUserId(val)} value={userId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Sélectionner un membre du personnel">
                {(val: string | null) => {
                  if (!val) return "Sélectionner un membre du personnel";
                  const u = staffUsers.find((s) => s.id === val);
                  return u ? `${u.lastName} ${u.firstName}` : val;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {staffUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.lastName} {u.firstName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shift-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Intitulé *
          </Label>
          <Input
            id="shift-title"
            placeholder="Ex: Garde de nuit, Matinée, Astreinte week-end..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="shift-start-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Début *</Label>
            <Input id="shift-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-start-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure de début *</Label>
            <Input id="shift-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-10" required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="shift-end-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fin *</Label>
            <Input id="shift-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-end-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure de fin *</Label>
            <Input id="shift-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-10" required />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shift-notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes (optionnel)</Label>
          <Textarea id="shift-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </div>

        <div className="flex justify-between items-center gap-2.5 pt-4 border-t">
          {isEdit ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleteLoading || loading} className="gap-2 text-destructive hover:text-destructive">
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 min-w-[120px] shadow-sm">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
