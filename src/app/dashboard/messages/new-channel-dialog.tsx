"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Hash, Loader2, Plus } from "lucide-react";
import { createChannel } from "@/actions/messages";
import { toast } from "sonner";

interface NewChannelDialogProps {
  organizationId: string | null;
  basePath: string;
}

// Bouton + dialogue de création d'un canal supplémentaire (#urgences, #garde-nuit et
// #staff-médical existent déjà par défaut pour chaque établissement, cf. ensureDefaultChannels) —
// réservé au coordinateur/admin côté serveur (createChannel), ce composant n'est rendu du tout que
// si canCreateChannel(currentUser.role) côté appelant (cf. chat-panel.tsx).
export default function NewChannelDialog({ organizationId, basePath }: NewChannelDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setName("");
      setError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await createChannel({ name, organizationId: organizationId || undefined });
      if (res.success && res.data) {
        toast.success(`Canal #${res.data.title} créé.`);
        handleOpenChange(false);
        router.push(`${basePath}?id=${res.data.id}`);
      } else {
        setError(res.error || "Erreur lors de la création du canal.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" />}>
        <Plus className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="bg-card border shadow-2xl rounded-2xl sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-primary" />
            Nouveau canal
          </DialogTitle>
          <DialogDescription>
            Un canal est visible et ouvert à tout le personnel actif de l&apos;établissement, comme #urgences ou #garde-nuit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="new-channel-name">Nom du canal *</Label>
            <Input
              id="new-channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: staff-pédiatrie"
              required
              minLength={2}
              maxLength={40}
            />
          </div>
          {error && (
            <div className="p-2.5 text-xs font-medium rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30">
              {error}
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading || name.trim().length < 2} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer le canal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
