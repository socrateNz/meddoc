"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Loader2, PlusCircle, X, Search, Wallet, Zap, CheckSquare, Square } from "lucide-react";
import { createLabOrder, listLabTests } from "@/actions/lab";
import { toast } from "sonner";

const PRIORITY_OPTIONS = [
  { value: "ROUTINE", label: "Routine" },
  { value: "URGENT", label: "Urgent" },
];

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface NewLabOrderDialogProps {
  patients: any[];
  defaultPatientId?: string;
  appointmentId?: string;
  onSuccess?: (order: any) => void;
}

export default function NewLabOrderDialog({ patients, defaultPatientId, appointmentId, onSuccess }: NewLabOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState(defaultPatientId || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"ROUTINE" | "URGENT">("ROUTINE");
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    if (open && catalog.length === 0) {
      setCatalogLoading(true);
      listLabTests().then((res) => { if (res.success) setCatalog(res.data || []); }).finally(() => setCatalogLoading(false));
    }
  }, [open, catalog.length]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((t) => t.name.toLowerCase().includes(q) || t.department?.toLowerCase().includes(q));
  }, [catalog, searchQuery]);

  const selectedTests = useMemo(() => catalog.filter((t) => tests.includes(t.name)), [catalog, tests]);
  const totalPrice = selectedTests.reduce((sum, t) => sum + (t.pharmacyItem?.unitPrice || 0), 0);
  const willRequirePayment = selectedTests.some((t) => t.requiresPaymentFirst !== false);

  const toggleTest = (test: any) => {
    if (!test.pharmacyItemId) return; // Non configuré — non sélectionnable
    setTests((prev) => (prev.includes(test.name) ? prev.filter((n) => n !== test.name) : [...prev, test.name]));
  };

  const resetForm = () => {
    setPatientId(defaultPatientId || "");
    setSearchQuery("");
    setTests([]);
    setNotes("");
    setPriority("ROUTINE");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      toast.error("Veuillez sélectionner un patient.");
      return;
    }
    if (tests.length === 0) {
      toast.error("Sélectionnez au moins un examen du catalogue.");
      return;
    }

    setLoading(true);
    try {
      const res = await createLabOrder({ patientId, tests, notes: notes || undefined, priority, appointmentId });
      if (res.success) {
        toast.success("Demande d'analyse envoyée.");
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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-blue-600 dark:text-blue-400">
            <FlaskConical className="h-5 w-5" />
            Nouvelle demande d&apos;analyse
          </DialogTitle>
          <DialogDescription>
            Sélectionnez les examens du catalogue à prescrire pour ce patient.
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
            <Label>Examens demandés *</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher un examen du catalogue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 rounded-xl"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border divide-y">
              {catalogLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement du catalogue...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {catalog.length === 0 ? "Aucun examen au catalogue — ajoutez-en depuis \"Catalogue des examens\"." : "Aucun résultat."}
                </p>
              ) : (
                filteredCatalog.map((t) => {
                  const checked = tests.includes(t.name);
                  const unconfigured = !t.pharmacyItemId;
                  return (
                    <button
                      type="button"
                      key={t.id}
                      disabled={unconfigured}
                      onClick={() => toggleTest(t)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                        unconfigured ? "opacity-50 cursor-not-allowed" : "hover:bg-accent cursor-pointer"
                      } ${checked ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                    >
                      {checked ? <CheckSquare className="h-4 w-4 text-blue-600 shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{t.name}</span>
                          {t.department && <Badge variant="outline" className="text-[10px]">{t.department}</Badge>}
                          {unconfigured ? (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-500 border-slate-500/20">Produit non configuré</Badge>
                          ) : t.requiresPaymentFirst !== false ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1"><Wallet className="h-2.5 w-2.5" />Caisse d&apos;abord</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1"><Zap className="h-2.5 w-2.5" />Labo direct</Badge>
                          )}
                        </div>
                      </div>
                      {t.pharmacyItem?.unitPrice != null && (
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">{formatFCFA(t.pharmacyItem.unitPrice)}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {selectedTests.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {selectedTests.map((t) => (
                    <Badge key={t.id} variant="secondary" className="gap-1 pr-1.5 py-0.5">
                      {t.name}
                      <button type="button" onClick={() => toggleTest(t)} className="text-muted-foreground hover:text-destructive transition-colors rounded-full">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total estimé : <span className="font-bold text-slate-700 dark:text-slate-300">{formatFCFA(totalPrice)}</span>
                  {willRequirePayment && " — passera par la caisse avant le laboratoire."}
                </p>
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
