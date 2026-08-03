"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Loader2, PlusCircle, X, Search } from "lucide-react";
import { createLabOrder, listLabTests } from "@/actions/lab";
import { toast } from "sonner";

const PRIORITY_OPTIONS = [
  { value: "ROUTINE", label: "Routine" },
  { value: "URGENT", label: "Urgent" },
];

interface NewLabOrderDialogProps {
  patients: any[];
  defaultPatientId?: string;
  onSuccess?: (order: any) => void;
}

export default function NewLabOrderDialog({ patients, defaultPatientId, onSuccess }: NewLabOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState(defaultPatientId || "");
  const [testInput, setTestInput] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"ROUTINE" | "URGENT">("ROUTINE");
  const [catalog, setCatalog] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (open && catalog.length === 0) {
      listLabTests().then((res) => { if (res.success) setCatalog(res.data || []); });
    }
  }, [open, catalog.length]);

  const suggestions = testInput.trim()
    ? catalog.filter((t) => t.name.toLowerCase().includes(testInput.trim().toLowerCase()) && !tests.includes(t.name)).slice(0, 6)
    : [];

  const addTest = (name: string) => {
    if (!tests.includes(name)) setTests((prev) => [...prev, name]);
    setTestInput("");
    setShowSuggestions(false);
  };

  const resetForm = () => {
    setPatientId(defaultPatientId || "");
    setTestInput("");
    setTests([]);
    setNotes("");
    setPriority("ROUTINE");
  };

  const handleAddTest = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && testInput.trim()) {
      e.preventDefault();
      addTest(testInput.trim());
    }
  };

  const handleRemoveTest = (idx: number) => {
    setTests(tests.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      toast.error("Veuillez sélectionner un patient.");
      return;
    }
    if (tests.length === 0) {
      toast.error("Ajoutez au moins une analyse (appuyez sur Entrée pour valider).");
      return;
    }

    setLoading(true);
    try {
      const res = await createLabOrder({ patientId, tests, notes: notes || undefined, priority });
      if (res.success) {
        toast.success("Demande d'analyse envoyée au laboratoire.");
        setOpen(false);
        resetForm();
        onSuccess?.(res.data);
      } else {
        toast.error(res.error || "Erreur lors de la création de la demande.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger render={<Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />}>
        <PlusCircle className="h-4 w-4" />
        Nouvelle demande d&apos;analyse
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-blue-600 dark:text-blue-400">
            <FlaskConical className="h-5 w-5" />
            Nouvelle demande d&apos;analyse
          </DialogTitle>
          <DialogDescription>
            Envoyez une demande d&apos;analyse de laboratoire pour un patient.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!defaultPatientId && (
            <div className="space-y-1.5">
              <Label>Patient *</Label>
              <select
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full h-9 px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">-- Choisir un patient --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.user.lastName} {p.user.firstName}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Analyses demandées * (catalogue ou saisie libre, Entrée pour ajouter)</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Ex: NFS, Glycémie à jeun..."
                value={testInput}
                onChange={(e) => { setTestInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleAddTest}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="pl-8 rounded-xl"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border bg-popover shadow-md">
                  {suggestions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2"
                      onClick={() => addTest(t.name)}
                    >
                      <span>{t.name}</span>
                      {t.price != null && <span className="text-muted-foreground shrink-0">{Math.round(t.price)} FCFA</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {tests.map((t, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1 pr-1.5 py-0.5">
                    {t}
                    <button type="button" onClick={() => handleRemoveTest(idx)} className="text-muted-foreground hover:text-destructive transition-colors rounded-full">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Priorité</Label>
            <Select items={PRIORITY_OPTIONS} value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Indications cliniques (optionnel)</Label>
            <Textarea
              placeholder="Contexte clinique à transmettre au laboratoire..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 rounded-xl"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Envoyer la demande
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
