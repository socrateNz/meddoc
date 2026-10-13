"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { upsertOperatingRoom } from "@/actions/surgery";

type Room = { id: string; name: string; isActive: boolean };

// Salles d'opération de la clinique (coordinateur). Une salle désactivée n'est plus proposée à la
// programmation mais ses interventions passées restent consultables.
export default function OperatingRoomsManager({ clinicId, rooms }: { clinicId: string; rooms: Room[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await upsertOperatingRoom({ clinicId, name: name.trim() });
    setSaving(false);
    if (res.success) {
      toast.success("Salle ajoutée.");
      setName("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const toggle = async (room: Room) => {
    const res = await upsertOperatingRoom({ id: room.id, clinicId, name: room.name, isActive: !room.isActive });
    if (res.success) router.refresh();
    else toast.error(res.error);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <form onSubmit={add} className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Nouvelle salle</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Salle 1, Salle de césarienne" className="h-9 rounded-xl" maxLength={60} />
        </div>
        <Button type="submit" disabled={saving || !name.trim()} className="h-9 gap-1.5 rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </Button>
      </form>
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800">
        {rooms.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Aucune salle.</p>
        ) : (
          rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <span className={`text-sm font-medium ${r.isActive ? "" : "text-muted-foreground line-through"}`}>{r.name}</span>
              <div className="flex items-center gap-2">
                {!r.isActive && <Badge variant="outline">Désactivée</Badge>}
                <Button size="sm" variant="ghost" onClick={() => toggle(r)}>
                  {r.isActive ? "Désactiver" : "Réactiver"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
