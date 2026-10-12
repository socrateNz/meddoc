"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Loader2, DoorOpen } from "lucide-react";
import { createRoom, updateRoom } from "@/actions/wards";
import { toast } from "sonner";

interface RoomDialogProps {
  wardId: string;
  room?: { id: string; name: string; nightlyRate?: number | null };
  // Tarif du service, affiché comme valeur par défaut quand la chambre n'a pas le sien.
  wardNightlyRate?: number | null;
  onSuccess?: () => void;
}

// Champ texte -> tarif : vide = pas de tarif propre (celui du service s'applique).
export function parseRateInput(value: string): number | null | "invalid" {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export default function RoomDialog({ wardId, room, wardNightlyRate, onSuccess }: RoomDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(room?.name || "");
  const [rate, setRate] = useState(room?.nightlyRate != null ? String(room.nightlyRate) : "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Le nom de la chambre est requis.");
      return;
    }
    const nightlyRate = parseRateInput(rate);
    if (nightlyRate === "invalid") {
      toast.error("Tarif invalide : saisissez un montant positif en FCFA, ou laissez vide.");
      return;
    }
    setLoading(true);
    try {
      const res = room
        ? await updateRoom(room.id, { name: name.trim(), nightlyRate })
        : await createRoom({ wardId, name: name.trim(), nightlyRate });
      if (res.success) {
        toast.success(room ? "Chambre mise à jour." : "Chambre ajoutée.");
        setOpen(false);
        if (!room) {
          setName("");
          setRate("");
        }
        onSuccess?.();
      } else {
        toast.error(res.error || "Erreur lors de l'enregistrement.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          room ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" />
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" />
          )
        }
      >
        {room ? <Edit className="h-3.5 w-3.5" /> : (<><Plus className="h-3.5 w-3.5" />Chambre</>)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[380px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <DoorOpen className="h-5 w-5 text-blue-500" />
            {room ? "Modifier la chambre" : "Nouvelle chambre"}
          </DialogTitle>
          <DialogDescription>{room ? "Renommez cette chambre ou modifiez son tarif." : "Ajoutez une chambre à ce service."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nom de la chambre *</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Chambre 12" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label>Tarif de la nuitée (FCFA)</Label>
            <Input
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder={wardNightlyRate != null ? `Tarif du service : ${wardNightlyRate} FCFA` : "Aucun tarif de service"}
              className="rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">
              Laissez vide pour appliquer le tarif du service (réservez un tarif propre aux chambres VIP, par exemple).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
