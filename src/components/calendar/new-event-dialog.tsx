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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CalendarClock, Trash2 } from "lucide-react";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/actions/calendar-events";
import { useSubmitGuard } from "@/hooks/use-submit-guard";
import { toast } from "sonner";

function toLocalDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}
function toLocalTimeStr(d: Date) {
  return d.toISOString().split("T")[1].slice(0, 5);
}

export interface CalendarEventRecord {
  id: string;
  title: string;
  description?: string | null;
  startAt: string | Date;
  endAt?: string | Date | null;
  allDay: boolean;
}

interface NewEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEventRecord | null;
  defaultDate?: string;
  onSuccess?: () => void;
}

// Événement libre, toujours strictement personnel (cf. src/actions/calendar-events.ts) — tout
// utilisateur authentifié peut en créer pour lui-même, aucun champ patient/soignant. Même
// principe "upsert" + formulaire remonté avec key que new-shift-dialog.tsx — voir son commentaire
// pour le pourquoi (évite tout setState dans un effet pour (ré)initialiser le formulaire).
export default function NewEventDialog({ open, onOpenChange, event, defaultDate, onSuccess }: NewEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-card border border-border/60 shadow-2xl rounded-2xl">
        {open && (
          <EventForm
            key={event?.id ?? "new"}
            event={event}
            defaultDate={defaultDate}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EventFormProps {
  event?: CalendarEventRecord | null;
  defaultDate?: string;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function EventForm({ event, defaultDate, onOpenChange, onSuccess }: EventFormProps) {
  const isEdit = !!event;
  const { submitting: loading, guard } = useSubmitGuard();
  const [deleteLoading, setDeleteLoading] = useState(false);

  const eventStart = event ? new Date(event.startAt) : null;

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description || "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(eventStart ? toLocalDateStr(eventStart) : defaultDate || toLocalDateStr(new Date()));
  const [startTime, setStartTime] = useState(eventStart ? toLocalTimeStr(eventStart) : "09:00");
  const [endTime, setEndTime] = useState(event?.endAt ? toLocalTimeStr(new Date(event.endAt)) : eventStart ? toLocalTimeStr(eventStart) : "10:00");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || (!allDay && (!startTime || !endTime))) {
      toast.error("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    try {
      const startAt = allDay ? new Date(`${startDate}T00:00:00`).toISOString() : new Date(`${startDate}T${startTime}`).toISOString();
      const endAt = allDay ? undefined : new Date(`${startDate}T${endTime}`).toISOString();

      // Seule la création porte une clé : une modification est idempotente par nature.
      const response = await guard((idempotencyKey) =>
        isEdit
          ? updateCalendarEvent({ id: event!.id, title, description: description || undefined, startAt, endAt, allDay })
          : createCalendarEvent({ title, description: description || undefined, startAt, endAt, allDay, idempotencyKey })
      );
      if (!response) return;

      if (response.success) {
        toast.success(isEdit ? "Événement mis à jour." : "Événement créé.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(response.error || "Erreur lors de l'enregistrement.");
      }
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    setDeleteLoading(true);
    try {
      const response = await deleteCalendarEvent(event.id);
      if (response.success) {
        toast.success("Événement supprimé.");
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
          <div className="p-2.5 rounded-xl bg-slate-500/10 text-slate-600">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold tracking-tight">
              {isEdit ? "Modifier l'événement" : "Nouvel événement"}
            </DialogTitle>
            <DialogDescription>Rappel ou réunion personnelle, visible uniquement par vous.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 pt-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Titre *
          </Label>
          <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" required />
        </div>

        <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
          <Checkbox checked={allDay} onCheckedChange={(checked) => setAllDay(!!checked)} />
          Toute la journée
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="event-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date *</Label>
            <Input id="event-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" required />
          </div>
          {!allDay && (
            <div className="space-y-1.5">
              <Label htmlFor="event-start-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure de début *</Label>
              <Input id="event-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-10" required />
            </div>
          )}
        </div>

        {!allDay && (
          <div className="space-y-1.5">
            <Label htmlFor="event-end-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure de fin *</Label>
            <Input id="event-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-10" required />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="event-description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description (optionnel)</Label>
          <Textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
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
