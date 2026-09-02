"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Unlock, Lock, Plus } from "lucide-react";
import { createRegister } from "@/actions/registers";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface OpenSessionDialogProps {
  registerName: string;
  onOpen: (openingFloat: number) => Promise<{ success: boolean; error?: string }>;
}

export function OpenSessionDialog({ registerName, onOpen }: OpenSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await onOpen(Number(openingFloat));
    setLoading(false);
    if (res.success) {
      setOpen(false);
      setOpeningFloat("0");
    } else {
      setError(res.error || "Erreur lors de l'ouverture.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg" />}>
        <Unlock className="h-3.5 w-3.5" />
        Ouvrir la caisse
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Unlock className="h-5 w-5" />
            Ouvrir « {registerName} »
          </DialogTitle>
          <DialogDescription>Renseignez le fond de caisse de départ avant de commencer votre service.</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="openingFloat">Fond de caisse (FCFA) *</Label>
            <Input
              id="openingFloat"
              type="number"
              min="0"
              required
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
              Ouvrir la caisse
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CloseSessionDialogProps {
  registerName: string;
  expectedAmount: number;
  onClose: (countedAmount: number, notes?: string) => Promise<{ success: boolean; error?: string }>;
}

export function CloseSessionDialog({ registerName, expectedAmount, onClose }: CloseSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [countedAmount, setCountedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const variance = countedAmount ? Number(countedAmount) - expectedAmount : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await onClose(Number(countedAmount), notes.trim() || undefined);
    setLoading(false);
    if (res.success) {
      setOpen(false);
      setCountedAmount("");
      setNotes("");
    } else {
      setError(res.error || "Erreur lors de la fermeture.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCountedAmount(""); setNotes(""); setError(""); } }}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 rounded-lg" />}>
        <Lock className="h-3.5 w-3.5" />
        Fermer la caisse
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <Lock className="h-5 w-5" />
            Fermer « {registerName} »
          </DialogTitle>
          <DialogDescription>Comptez le contenu de la caisse et saisissez le montant total trouvé.</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-sm">
            <span className="text-slate-500 font-medium">Montant théorique attendu</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{formatFCFA(expectedAmount)}</span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="countedAmount">Montant compté (FCFA) *</Label>
            <Input
              id="countedAmount"
              type="number"
              min="0"
              required
              value={countedAmount}
              onChange={(e) => setCountedAmount(e.target.value)}
              className="rounded-xl"
            />
          </div>
          {countedAmount && (
            <div className={`p-2.5 rounded-xl text-xs font-bold text-center ${variance === 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"}`}>
              Écart : {variance > 0 ? "+" : ""}{formatFCFA(variance)}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="closeNotes">Notes (optionnel)</Label>
            <Input id="closeNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex: écart justifié par..." className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Fermer la caisse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateRegisterDialog({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await createRegister({ organizationId, name: name.trim() });
    setLoading(false);
    if (res.success) {
      setOpen(false);
      setName("");
      onCreated();
    } else {
      setError(res.error || "Erreur lors de la création.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5 rounded-lg" />}>
        <Plus className="h-3.5 w-3.5" />
        Nouvelle caisse
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>Créer une caisse</DialogTitle>
          <DialogDescription>ex: « Caisse Accueil », « Caisse Urgences »...</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="p-3 text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="registerName">Nom de la caisse *</Label>
            <Input id="registerName" required value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={loading || !name.trim()} className="rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
