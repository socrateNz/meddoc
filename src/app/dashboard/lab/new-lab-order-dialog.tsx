"use client";

import SearchSelect from "@/components/ui/search-select";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/ui/searchable-select";
import { FlaskConical, Loader2, PlusCircle, X, Search, CheckSquare, Square, WifiOff } from "lucide-react";
import { createLabOrder, listLabTests } from "@/actions/lab";
import { submitOrQueueOffline } from "@/lib/offline-submit";
import { useSubmitGuard } from "@/hooks/use-submit-guard";
import { useIsOffline } from "@/hooks/useIsOffline";
import { useOfflineLabTests } from "@/hooks/use-offline-lab-tests";
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
  // Établissement ciblé — nécessaire pour répliquer le catalogue hors-ligne (cf.
  // use-offline-lab-tests.ts) ; sans lui, la demande reste utilisable en ligne mais ne bascule
  // pas sur le catalogue local si le réseau tombe.
  organizationId?: string;
  onSuccess?: (order: any) => void;
  // Visite prénatale d'origine (maternité) : la demande y est rattachée et s'affiche sous la visite.
  prenatalVisitId?: string;
  // Bouton compact (ex. dans une ligne de visite) au lieu du gros bouton bleu.
  triggerLabel?: string;
  // Raccourci « tout cocher » pour un bilan type (ex. bilan prénatal) parmi le catalogue.
  quickPick?: { label: string; match: (testName: string) => boolean };
  // Cliniques partenaires actives : la demande peut venir de l'une d'elles (prix partenaire,
  // rapport à son en-tête). Absent ou vide = demande interne uniquement.
  partners?: { id: string; name: string }[];
  // Le laborantin n'enregistre que des demandes de partenaires (prescription externe).
  partnerOnly?: boolean;
}

export default function NewLabOrderDialog({ patients, defaultPatientId, appointmentId, organizationId, onSuccess, prenatalVisitId, triggerLabel, quickPick, partners = [], partnerOnly = false }: NewLabOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const { submitting: loading, guard } = useSubmitGuard();
  const [patientId, setPatientId] = useState(defaultPatientId || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [tests, setTests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"ROUTINE" | "URGENT">("ROUTINE");
  const [partnerId, setPartnerId] = useState("");
  const [partnerReference, setPartnerReference] = useState("");

  const isOffline = useIsOffline();

  const { data: onlineCatalog = [], isLoading: catalogLoading, isError: catalogError } = useQuery({
    queryKey: ["labTests"],
    queryFn: async () => {
      const res = await listLabTests();
      if (!res.success) throw new Error(res.error);
      return res.data || [];
    },
    enabled: open && !isOffline,
    retry: false,
  });
  // Repli sur le catalogue répliqué localement dès qu'on est hors-ligne, ou que la requête en
  // ligne a échoué (connexion qui se déclarait active mais ne menait nulle part).
  const useOfflineCatalog = isOffline || catalogError;
  const offlineCatalogQuery = useOfflineLabTests(organizationId, open && useOfflineCatalog);
  const catalog = useMemo(
    () => (useOfflineCatalog ? offlineCatalogQuery.data || [] : onlineCatalog),
    [useOfflineCatalog, offlineCatalogQuery.data, onlineCatalog]
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((t) => t.name.toLowerCase().includes(q) || t.department?.toLowerCase().includes(q));
  }, [catalog, searchQuery]);

  const selectedTests = useMemo(() => catalog.filter((t) => tests.includes(t.name)), [catalog, tests]);
  // Prix affiché : prix partenaire de l'examen quand la demande vient d'un partenaire.
  const priceOf = (t: { totalPrice?: number; partnerPrice?: number | null }) => (partnerId && t.partnerPrice != null ? t.partnerPrice : t.totalPrice || 0);
  const totalPrice = selectedTests.reduce((sum, t) => sum + priceOf(t), 0);

  // Examens du catalogue correspondant au raccourci (ex. bilan prénatal) : un clic les coche tous.
  const quickPickTests = useMemo(() => (quickPick ? catalog.filter((t) => quickPick.match(t.name)) : []), [catalog, quickPick]);
  const applyQuickPick = () => setTests((prev) => [...new Set([...prev, ...quickPickTests.map((t) => t.name)])]);

  const toggleTest = (test: any) => {
    setTests((prev) => (prev.includes(test.name) ? prev.filter((n) => n !== test.name) : [...prev, test.name]));
  };

  const resetForm = () => {
    setPatientId(defaultPatientId || "");
    setSearchQuery("");
    setTests([]);
    setNotes("");
    setPriority("ROUTINE");
    setPartnerId("");
    setPartnerReference("");
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
    if (partnerOnly && !partnerId) {
      toast.error("Choisissez la clinique partenaire qui demande ces examens.");
      return;
    }

    try {
      const payload = {
        patientId,
        tests,
        notes: notes || undefined,
        priority,
        appointmentId,
        prenatalVisitId,
        partnerId: partnerId || undefined,
        partnerReference: partnerId ? partnerReference.trim() || undefined : undefined,
      };
      const patientLabel = patients.find((p) => p.id === patientId);
      // La clé voyage aussi dans la file hors-ligne : un rejeu ne crée pas une seconde demande.
      const res = await guard((idempotencyKey) =>
        submitOrQueueOffline({
          action: () => createLabOrder({ ...payload, idempotencyKey }),
          queueType: "LAB_ORDER",
          payload: { ...payload, idempotencyKey },
          label: `Demande d'analyse — ${patientLabel ? `${patientLabel.user.lastName} ${patientLabel.user.firstName}` : "patient"}`,
        })
      );
      if (!res) return;
      if (!res.success) {
        toast.error(res.error || "Erreur lors de la création de la demande.");
      } else if (res.queued) {
        toast.success("Hors-ligne : demande enregistrée localement, sera envoyée au retour du réseau.");
        setOpen(false);
        resetForm();
      } else {
        toast.success("Demande d'analyse envoyée.");
        setOpen(false);
        resetForm();
        onSuccess?.(res.data);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de connexion.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      {triggerLabel ? (
        <DialogTrigger render={<Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg text-xs" />}>
          <FlaskConical className="h-3.5 w-3.5" />
          {triggerLabel}
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs" />}>
          <PlusCircle className="h-4 w-4" />
          Nouvelle demande d&apos;analyse
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[560px] sm:p-6">
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
              <SearchableSelect
                value={patientId}
                onValueChange={setPatientId}
                placeholder="-- Rechercher un patient --"
                emptyText="Aucun patient trouvé."
                options={patients.map((p) => ({ value: p.id, label: `${p.user.lastName} ${p.user.firstName}` }))}
              />
            </div>
          )}

          {partners.length > 0 && !prenatalVisitId && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lab-partner">Demande de {partnerOnly ? "*" : ""}</Label>
                <SearchSelect
                  id="lab-partner"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base sm:h-9 sm:text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  {!partnerOnly && <option value="">Notre clinique</option>}
                  {partnerOnly && <option value="">Choisir le partenaire…</option>}
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SearchSelect>
              </div>
              {partnerId && (
                <div className="space-y-1.5">
                  <Label htmlFor="lab-partner-ref">N° du bon de demande</Label>
                  <Input id="lab-partner-ref" value={partnerReference} onChange={(e) => setPartnerReference(e.target.value)} maxLength={60} placeholder="Optionnel" className="rounded-xl text-base sm:text-sm" />
                </div>
              )}
              {partnerId && (
                <p className="text-xs text-violet-700 sm:col-span-2 dark:text-violet-300">
                  Prix partenaire appliqué ; le rapport sortira à l&apos;en-tête du partenaire.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Examens demandés *</Label>
              {quickPick && quickPickTests.length > 0 && (
                <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={applyQuickPick}>
                  {quickPick.label} ({quickPickTests.length})
                </Button>
              )}
              {useOfflineCatalog && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <WifiOff className="h-3 w-3" /> Catalogue hors-ligne (tarifs estimatifs)
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher un examen du catalogue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 rounded-xl text-base sm:text-sm"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border divide-y">
              {catalogLoading && !useOfflineCatalog ? (
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
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTest(t)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors hover:bg-accent cursor-pointer ${checked ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                    >
                      {checked ? <CheckSquare className="h-4 w-4 text-blue-600 shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{t.name}</span>
                          {t.department && <Badge variant="outline" className="text-xs">{t.department}</Badge>}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground shrink-0">{formatFCFA(priceOf(t))}</span>
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
