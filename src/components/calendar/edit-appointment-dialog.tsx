"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CalendarClock } from "lucide-react";
import { updateAppointment } from "@/actions/appointments";
import { toast } from "sonner";
import { CalendarAppointment, AppointmentCaregiver, AppointmentPatient } from "./types";

interface EditAppointmentDialogProps {
  appointment: CalendarAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caregivers: AppointmentCaregiver[];
  patients?: AppointmentPatient[];
  onSuccess?: () => void;
}

export default function EditAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  caregivers,
  onSuccess,
}: EditAppointmentDialogProps) {
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [caregiverId, setCaregiverId] = useState("unassigned");
  const [status, setStatus] = useState("SCHEDULED");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("45");

  useEffect(() => {
    if (appointment && open) {
      setTitle(appointment.title || "");
      setType(appointment.type || "Consultation médicale");
      setCaregiverId(appointment.caregiverId || "unassigned");
      setStatus(appointment.status || "SCHEDULED");
      setDurationMinutes(String(appointment.durationMinutes || 45));

      const d = new Date(appointment.scheduledAt);
      const datePart = d.toISOString().split("T")[0];
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      setDate(datePart);
      setTime(`${hours}:${mins}`);
    }
  }, [appointment, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointment) return;

    if (!title || !type || !date || !time) {
      toast.error("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      const res = await updateAppointment({
        id: appointment.id,
        title,
        type,
        status,
        durationMinutes: Number(durationMinutes),
        scheduledAt,
        caregiverId: caregiverId === "unassigned" ? null : caregiverId,
      });

      if (res.success) {
        toast.success("Rendez-vous mis à jour avec succès.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "Erreur lors de la modification.");
      }
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  if (!appointment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-card border border-border/60 shadow-2xl rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Modifier le rendez-vous</DialogTitle>
              <DialogDescription>
                Patient : <span className="font-semibold text-foreground">{appointment.patient.user.lastName} {appointment.patient.user.firstName}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objet / Titre *
            </Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Praticien */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Praticien / Soignant</Label>
              <Select onValueChange={(val) => val && setCaregiverId(val)} value={caregiverId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Sélectionner un soignant">
                    {(val: any) => {
                      if (!val || val === "unassigned") return "Non assigné";
                      const c = caregivers.find((cg) => cg.id === val);
                      return c ? `Dr. ${c.user.lastName} ${c.user.firstName}` : val;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="unassigned">Non assigné</SelectItem>
                  {caregivers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Dr. {c.user.lastName} {c.user.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Statut */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut</Label>
              <Select onValueChange={(val) => val && setStatus(val)} value={status}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Statut">
                    {(val: any) => {
                      const map: Record<string, string> = {
                        SCHEDULED: "Planifié",
                        IN_PROGRESS: "En cours",
                        COMPLETED: "Terminé",
                        CANCELLED: "Annulé",
                      };
                      return map[val] || val;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHEDULED">Planifié</SelectItem>
                  <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                  <SelectItem value="COMPLETED">Terminé</SelectItem>
                  <SelectItem value="CANCELLED">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type d'acte *</Label>
              <Select onValueChange={(val) => val && setType(val)} value={type}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Type d'acte">
                    {(val: any) => val || "Type d'acte"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consultation médicale">Consultation médicale</SelectItem>
                  <SelectItem value="Soins infirmiers">Soins infirmiers</SelectItem>
                  <SelectItem value="Suivi régulier">Suivi régulier</SelectItem>
                  <SelectItem value="Visite médicale">Visite médicale</SelectItem>
                  <SelectItem value="Examen / Bilan">Examen / Bilan</SelectItem>
                  <SelectItem value="Téléconsultation">Téléconsultation</SelectItem>
                  <SelectItem value="Aide à la personne">Aide à la personne</SelectItem>
                  <SelectItem value="Autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Durée *</Label>
              <Select onValueChange={(val) => val && setDurationMinutes(val)} value={durationMinutes}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Durée">
                    {(val: any) => {
                      const labels: Record<string, string> = {
                        "15": "15 min",
                        "30": "30 min",
                        "45": "45 min",
                        "60": "1 heure",
                        "90": "1h30",
                        "120": "2 heures",
                      };
                      return labels[val] || `${val} min`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 heure</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                  <SelectItem value="120">2 heures</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date *</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10"
                required
              />
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure *</Label>
              <Input
                id="edit-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-10"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 min-w-[120px]">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                "Sauvegarder"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
