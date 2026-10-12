"use client";

import { useEffect, useState } from "react";
import { BedDouble, CalendarClock, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { correctStayAdmission, getOpenStaySummary } from "@/actions/stays";

type StaySummary = NonNullable<Extract<Awaited<ReturnType<typeof getOpenStaySummary>>, { success: true }>["data"]>;

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

function formatDateTime(d: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

// Valeur d'un <input type="datetime-local"> à l'heure locale du navigateur.
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Hospitalisation en cours : date d'entrée, lit, nuitées et montant dus à date (cf.
// src/lib/hospital-stay.ts). Rien n'est affiché pour un patient non hospitalisé.
export default function HospitalStayCard({ patientId }: { patientId: string }) {
  const [stay, setStay] = useState<StaySummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [admittedAt, setAdmittedAt] = useState("");
  const [saving, setSaving] = useState(false);
  // Incrémenté après une correction pour recharger le résumé.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getOpenStaySummary(patientId).then((res) => {
      if (!cancelled) setStay(res.success ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  if (!stay) return null;

  const handleCorrect = async () => {
    if (!admittedAt) return;
    setSaving(true);
    const res = await correctStayAdmission({ stayId: stay.stayId, admittedAt: new Date(admittedAt).toISOString() });
    setSaving(false);
    if (res.success) {
      toast.success("Date d'entrée corrigée.");
      setEditing(false);
      setReloadKey((k) => k + 1);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 flex flex-col md:flex-row md:items-center gap-4">
      <div className="h-10 w-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
        <BedDouble className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Hospitalisation en cours</p>
        <p className="text-sm">
          Entré(e) le <span className="font-semibold">{formatDateTime(stay.admittedAt)}</span>
          {stay.currentBed && (
            <>
              {" • "}
              {stay.currentBed.wardName} / {stay.currentBed.roomName} (lit {stay.currentBed.bedLabel})
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {stay.nightsToDate} nuitée{stay.nightsToDate > 1 ? "s" : ""} à ce jour • {formatFCFA(stay.amountToDate)}
          {stay.nightsBilled > 0 && ` • ${stay.nightsBilled} déjà facturée${stay.nightsBilled > 1 ? "s" : ""}`}
          {stay.currentBed && stay.currentBed.nightlyRate === 0 && " • lit sans tarif"}
        </p>
        {editing && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              type="datetime-local"
              value={admittedAt}
              max={toLocalInputValue(new Date().toISOString())}
              onChange={(e) => setAdmittedAt(e.target.value)}
              className="h-8 w-auto rounded-lg"
            />
            <Button size="sm" className="h-8 rounded-lg" disabled={saving || !admittedAt} onClick={handleCorrect}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enregistrer"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => setEditing(false)}>
              Annuler
            </Button>
          </div>
        )}
      </div>
      {stay.canCorrectAdmission && !editing && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-lg shrink-0"
          onClick={() => {
            setAdmittedAt(toLocalInputValue(stay.admittedAt));
            setEditing(true);
          }}
          title="Corriger la date d'entrée réelle (possible tant qu'aucune nuitée n'est facturée)"
        >
          <Pencil className="h-3.5 w-3.5" />
          <CalendarClock className="h-3.5 w-3.5" />
          Date d&apos;entrée
        </Button>
      )}
    </div>
  );
}
