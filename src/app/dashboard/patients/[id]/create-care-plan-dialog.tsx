"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, HeartPulse, Loader2 } from "lucide-react";
import { createCarePlan } from "@/actions/careplans";
import { toast } from "sonner";

export default function CreateCarePlanDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.startDate) {
      toast.error("Le titre et la date de début sont requis.");
      return;
    }

    setLoading(true);
    const result = await createCarePlan({
      patientId,
      title: formData.title,
      startDate: formData.startDate,
      endDate: formData.endDate || undefined,
    });
    setLoading(false);

    if (result.success) {
      toast.success("Plan de soins créé avec succès !");
      setOpen(false);
      setFormData({ title: "", startDate: new Date().toISOString().slice(0, 10), endDate: "" });
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button className="gap-2">
          <HeartPulse className="h-4 w-4" />
          Créer un Plan de Soins
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouveau Plan de Soins</DialogTitle>
            <DialogDescription>
              Définissez un nouveau programme de soins pour ce patient.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Titre du plan</Label>
              <Input
                id="title"
                placeholder="Ex: Suivi post-opératoire"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="startDate">Date de début</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endDate">Date de fin (Optionnel)</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer le plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
