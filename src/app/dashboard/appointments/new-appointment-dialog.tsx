"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { createAppointment } from "@/actions/appointments";
import { toast } from "sonner";

interface NewAppointmentDialogProps {
  patients: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
    };
  }[];
  caregivers: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
    };
  }[];
}

export default function NewAppointmentDialog({ patients, caregivers }: NewAppointmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [patientId, setPatientId] = useState("");
  const [caregiverId, setCaregiverId] = useState("unassigned");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !title || !type || !date || !time) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      // Combine date and time
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
        setOpen(false);
        // Reset form
        setPatientId("");
        setCaregiverId("unassigned");
        setTitle("");
        setType("");
        setDate("");
        setTime("");
        setDurationMinutes("60");
      } else {
        toast.error(response.error || "Erreur lors de la planification.");
      }
    } catch (err: any) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg transition-all hover:scale-[1.02] duration-200" />}>
        <Plus className="h-4 w-4" />
        Planifier
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border border-border/40 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">Planifier un Rendez-vous</DialogTitle>
          <DialogDescription>
            Créez une nouvelle intervention à domicile pour un patient.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          {/* Patient */}
          <div className="space-y-2">
            <Label>Patient *</Label>
            <Select onValueChange={(val) => val && setPatientId(val)} value={patientId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.user.lastName} {p.user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Caregiver */}
          <div className="space-y-2">
            <Label>Intervenant (Soignant) *</Label>
            <Select onValueChange={(val) => val && setCaregiverId(val)} value={caregiverId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un soignant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Non assigné (À définir)</SelectItem>
                {caregivers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.user.lastName} {c.user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Titre de l'intervention *</Label>
            <Input
              id="title"
              placeholder="Ex: Aide à la toilette / Soins quotidiens"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div className="space-y-2">
              <Label>Type d'acte *</Label>
              <Select onValueChange={(val) => val && setType(val)} value={type}>
                <SelectTrigger>
                  <SelectValue placeholder="Type d'acte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Soins infirmiers">Soins infirmiers</SelectItem>
                  <SelectItem value="Toilette">Aide à la toilette</SelectItem>
                  <SelectItem value="Repas">Préparation de repas</SelectItem>
                  <SelectItem value="Visite médicale">Visite médicale</SelectItem>
                  <SelectItem value="Aide ménagère">Aide ménagère</SelectItem>
                  <SelectItem value="Autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Durée *</Label>
              <Select onValueChange={(val) => val && setDurationMinutes(val)} value={durationMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Durée" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 heure</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                  <SelectItem value="120">2 heures</SelectItem>
                  <SelectItem value="180">3 heures</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Date de passage *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Time */}
            <div className="space-y-2">
              <Label htmlFor="time">Heure de passage *</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="min-w-[100px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Planification...
                </>
              ) : (
                "Valider"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
