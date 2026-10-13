"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Ticket, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listPatientsPage } from "@/actions/patient-list";
import { registerVisit } from "@/actions/visits";
import { VISIT_DESTINATIONS, VISIT_DESTINATION_LABELS, type VisitDestination } from "@/lib/visits";
import NewPatientDialog from "@/app/dashboard/patients/new-patient-dialog";

type FoundPatient = { id: string; name: string; ipp: string | null };

const selectClass =
  "w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white";

// Enregistrement d'une arrivée : patient existant (recherche par nom, IPP, téléphone) ou créé sur
// place, orientation, priorité et médecin souhaité — le ticket du jour est attribué par le serveur.
export default function RegisterVisitDialog({
  clinicId,
  doctors,
  onRegistered,
}: {
  clinicId: string;
  doctors: { id: string; name: string }[];
  onRegistered: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoundPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState<FoundPatient | null>(null);
  const [destination, setDestination] = useState<VisitDestination>("CONSULTATION");
  const [assignedToId, setAssignedToId] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Recherche du patient (debounce) — mêmes critères que la liste des patients, IPP compris.
  useEffect(() => {
    const term = search.trim();
    if (!open || patient || term.length < 2) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setSearching(true);
      const res = await listPatientsPage({ organizationId: clinicId, search: term, page: 1 });
      if (cancelled) return;
      setSearching(false);
      setResults(
        res.success
          ? res.data.map((p) => ({ id: p.id, name: `${p.user.lastName} ${p.user.firstName}`, ipp: p.ipp ?? null }))
          : []
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search, open, patient, clinicId]);

  const reset = () => {
    setSearch("");
    setResults([]);
    setPatient(null);
    setDestination("CONSULTATION");
    setAssignedToId("");
    setUrgent(false);
    setReason("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) {
      toast.error("Sélectionnez ou créez le patient.");
      return;
    }
    setSaving(true);
    const res = await registerVisit({
      clinicId,
      patientId: patient.id,
      destination,
      priority: urgent ? "URGENT" : "NORMAL",
      reason: reason.trim() || undefined,
      assignedToId: destination === "CONSULTATION" && assignedToId ? assignedToId : undefined,
    });
    setSaving(false);
    if (res.success) {
      toast.success(`Ticket ${res.data.ticket} — ${patient.name}`, { duration: 8000 });
      setOpen(false);
      reset();
      onRegistered();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs" />}>
        <Ticket className="h-4 w-4" />
        Nouvelle arrivée
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Enregistrer une arrivée</DialogTitle>
          <DialogDescription>Le patient reçoit un ticket de passage du jour et rejoint la file d&apos;attente.</DialogDescription>
        </DialogHeader>

        {/* Sélection du patient HORS du <form> : la création sur place (NewPatientDialog) a son
            propre formulaire, dont la soumission remonterait sinon jusqu'à celui-ci (React propage
            les événements à travers les portails). */}
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Patient *</Label>
            {patient ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{patient.name}</p>
                  {patient.ipp && <p className="text-xs font-mono text-muted-foreground">{patient.ipp}</p>}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>
                  Changer
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, IPP ou téléphone..."
                    className="pl-9 rounded-xl"
                  />
                  {searching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
                </div>
                {search.trim().length >= 2 && !searching && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {results.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">Aucun patient trouvé.</p>
                    ) : (
                      results.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setPatient(r)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <span className="text-sm font-medium">{r.name}</span>
                          {r.ipp && <span className="ml-2 text-xs font-mono text-muted-foreground">{r.ipp}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5" />
                  Patient non enregistré ?
                  <NewPatientDialog defaultOrganizationId={clinicId} onCreated={(p) => setPatient(p)} />
                </div>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="destination">Orientation *</Label>
              <select id="destination" value={destination} onChange={(e) => setDestination(e.target.value as VisitDestination)} className={selectClass}>
                {VISIT_DESTINATIONS.map((d) => (
                  <option key={d} value={d}>
                    {VISIT_DESTINATION_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor">Médecin</Label>
              <select
                id="doctor"
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                disabled={destination !== "CONSULTATION"}
                className={selectClass}
              >
                <option value="">Premier disponible</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Motif de venue</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: Fièvre depuis 3 jours, contrôle tensionnel..." className="rounded-xl" maxLength={300} />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-red-600" />
            <span className={urgent ? "text-red-600" : ""}>Urgent — passe en tête de file</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !patient} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
              Attribuer le ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
