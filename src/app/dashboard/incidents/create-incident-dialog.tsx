"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { createIncident } from "@/actions/patients";
import { toast } from "sonner";
import { Priority } from "@prisma/client";

interface CreateIncidentDialogProps {
  patients: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
    };
  }[];
  reportedById: string;
}

export default function CreateIncidentDialog({ patients, reportedById }: CreateIncidentDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [patientId, setPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !title || !description) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    try {
      const response = await createIncident({
        patientId,
        reportedById,
        title,
        description,
        priority,
      });

      if (response.success) {
        toast.success("Incident signalé avec succès. Les équipes ont été alertées.");
        setOpen(false);
        setPatientId("");
        setTitle("");
        setDescription("");
        setPriority(Priority.MEDIUM);
      } else {
        toast.error(response.error || "Erreur lors du signalement.");
      }
    } catch (err: any) {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" className="flex flex-row gap-2 bg-destructive hover:bg-destructive/95 text-destructive-foreground shadow-lg transition-all hover:scale-[1.02] duration-200" />}>
        <AlertTriangle className="h-4 w-4" />
        Signaler un incident
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card border border-border/40 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Signaler un Incident
          </DialogTitle>
          <DialogDescription>
            Déclarez une anomalie, une chute, ou un problème médical urgent concernant un patient.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3">
          {/* Patient */}
          <div className="space-y-2">
            <Label>Patient concerné *</Label>
            <Select onValueChange={(val) => val && setPatientId(val)} value={patientId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le patient">
                  {(val: any) => {
                    if (!val) return "Sélectionner le patient";
                    const p = patients.find(p => p.id === val);
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
            <Label htmlFor="title">Titre de l'incident *</Label>
            <Input
              id="title"
              placeholder="Ex: Hausse anormale de tension / Oubli de traitement"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Priorité *</Label>
            <Select onValueChange={(val) => val && setPriority(val as Priority)} value={priority}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir une priorité">
                  {(val: any) => {
                    if (!val) return "Choisir une priorité";
                    const labels: Record<string, string> = {
                      [Priority.LOW]: "Faible (LOW)",
                      [Priority.MEDIUM]: "Moyenne (MEDIUM)",
                      [Priority.HIGH]: "Élevée (HIGH)",
                      [Priority.CRITICAL]: "Critique (CRITICAL)"
                    };
                    return labels[val] || val;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={Priority.LOW}>Faible (LOW)</SelectItem>
                <SelectItem value={Priority.MEDIUM}>Moyenne (MEDIUM)</SelectItem>
                <SelectItem value={Priority.HIGH}>Élevée (HIGH)</SelectItem>
                <SelectItem value={Priority.CRITICAL}>Critique (CRITICAL)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description détaillée *</Label>
            <Textarea
              id="description"
              placeholder="Décrivez précisément ce qu'il s'est passé, les mesures immédiates prises et l'état de santé du patient..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
            />
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
            <Button type="submit" disabled={loading} variant="destructive" className="flex flex-row gap-2 min-w-[100px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signalement...
                </>
              ) : (
                "Signaler"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
