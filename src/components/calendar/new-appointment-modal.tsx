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
import { Loader2, CalendarPlus } from "lucide-react";
import { createAppointment } from "@/actions/appointments";
import { toast } from "sonner";
import { AppointmentPatient, AppointmentCaregiver } from "./types";

interface NewAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: AppointmentPatient[];
  caregivers: AppointmentCaregiver[];
  defaultDate?: string; // YYYY-MM-DD
  defaultTime?: string; // HH:MM
  onSuccess?: () => void;
}

export default function NewAppointmentModal({
  open,
  onOpenChange,
  patients,
  caregivers,
  defaultDate,
  defaultTime,
  onSuccess,
}: NewAppointmentModalProps) {
  const [loading, setLoading] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [caregiverId, setCaregiverId] = useState("unassigned");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Consultation médicale");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("45");

  useEffect(() => {
    if (open) {
      if (defaultDate) setDate(defaultDate);
      else {
        const todayStr = new Date().toISOString().split("T")[0];
        setDate(todayStr);
      }
      if (defaultTime) setTime(defaultTime);
    }
  }, [open, defaultDate, defaultTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !title || !type || !date || !time) {
      toast.error("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString();
      const caregiverVal = caregiverId === "unassigned" ? undefined : caregiverId;

      const response = await createAppointment({
        patientId,
        caregiverId: caregiverVal,
        title,
        type,
        scheduledAt,
        durationMinutes: Number(durationMinutes),
      });

      if (response.success) {
        toast.success("Rendez-vous planifié avec succès.");
        onOpenChange(false);
        // Reset
        setPatientId("");
        setCaregiverId("unassigned");
        setTitle("");
        setType("Consultation médicale");
        setDurationMinutes("45");
        onSuccess?.();
      } else {
        toast.error(response.error || "Erreur lors de la planification.");
      }
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-card border border-border/60 shadow-2xl rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <CalendarPlus className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Nouveau rendez-vous</DialogTitle>
              <DialogDescription>
                Planifiez un créneau de consultation ou d'intervention.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          {/* Patient */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient *</Label>
            <Select onValueChange={(val) => val && setPatientId(val)} value={patientId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Sélectionner un patient">
                  {(val: any) => {
                    if (!val) return "Sélectionner un patient";
                    const p = patients.find((pat) => pat.id === val);
                    return p ? `${p.user.lastName} ${p.user.firstName}` : val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.user.lastName} {p.user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Caregiver */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Praticien / Soignant</Label>
            <Select onValueChange={(val) => val && setCaregiverId(val)} value={caregiverId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Sélectionner un praticien">
                  {(val: any) => {
                    if (!val) return "Sélectionner un praticien";
                    if (val === "unassigned") return "Non assigné (À définir)";
                    const c = caregivers.find((cg) => cg.id === val);
                    return c ? `${c.user.lastName} ${c.user.firstName}` : val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="unassigned">Non assigné (À définir)</SelectItem>
                {caregivers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Dr. {c.user.lastName} {c.user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="apt-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objet du rendez-vous *
            </Label>
            <Input
              id="apt-title"
              placeholder="Ex: Consultation cardiologie, Suivi tensionnel, Soins..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10"
              required
            />
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
                        "15": "15 minutes",
                        "30": "30 minutes",
                        "45": "45 minutes",
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
              <Label htmlFor="apt-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date *</Label>
              <Input
                id="apt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10"
                required
              />
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label htmlFor="apt-time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Heure *</Label>
              <Input
                id="apt-time"
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
