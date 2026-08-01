"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { createContract } from "@/actions/contracts";
import { toast } from "sonner";

interface NewContractDialogProps {
  patients: { id: string; user: { firstName: string; lastName: string } }[];
  caregivers: { id: string; user: { firstName: string; lastName: string } }[];
  organizationId?: string;
}

export default function NewContractDialog({ patients, caregivers, organizationId }: NewContractDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [caregiverId, setCaregiverId] = useState("unassigned");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");

  const resetForm = () => {
    setPatientId("");
    setCaregiverId("unassigned");
    setTitle("");
    setStartDate("");
    setEndDate("");
    setHourlyRate("");
    setHoursPerWeek("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !title || !startDate || !hourlyRate || !hoursPerWeek) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const response = await createContract({
        patientId,
        caregiverId: caregiverId === "unassigned" ? undefined : caregiverId,
        title,
        startDate,
        endDate: endDate || undefined,
        hourlyRate: Number(hourlyRate),
        hoursPerWeek: Number(hoursPerWeek),
        organizationId,
      });

      if (response.success) {
        toast.success("Contrat créé avec succès.");
        setOpen(false);
        resetForm();
      } else {
        toast.error(response.error || "Erreur lors de la création du contrat.");
      }
    } catch (err: any) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="flex flex-row gap-2" />}>
        <Plus className="h-4 w-4" />
        Nouveau contrat
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border border-border/40 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">Nouveau contrat aidant</DialogTitle>
          <DialogDescription>
            Définissez les conditions d'intervention d'un aidant/soignant auprès d'un patient.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label>Patient *</Label>
            <Select onValueChange={(val) => val && setPatientId(val)} value={patientId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un patient">
                  {(val: any) => {
                    if (!val) return "Sélectionner un patient";
                    const p = patients.find((p) => p.id === val);
                    return p ? `${p.user.lastName} ${p.user.firstName}` : val;
                  }}
                </SelectValue>
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

          <div className="space-y-2">
            <Label>Aidant / Soignant</Label>
            <Select onValueChange={(val) => val && setCaregiverId(val)} value={caregiverId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un aidant">
                  {(val: any) => {
                    if (!val || val === "unassigned") return "Non assigné (à définir)";
                    const c = caregivers.find((c) => c.id === val);
                    return c ? `${c.user.lastName} ${c.user.firstName}` : val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Non assigné (à définir)</SelectItem>
                {caregivers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.user.lastName} {c.user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Objet du contrat *</Label>
            <Input
              id="title"
              placeholder="Ex: Accompagnement quotidien à domicile"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Taux horaire (FCFA) *</Label>
              <Input
                id="hourlyRate"
                type="number"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hoursPerWeek">Heures / semaine *</Label>
              <Input
                id="hoursPerWeek"
                type="number"
                min="1"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Date de début *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Date de fin (optionnelle)</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="flex flex-row gap-2 min-w-[100px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
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
