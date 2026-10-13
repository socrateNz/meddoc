"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cancelTransfusion, completeTransfusion, listTransfusions, startTransfusion } from "@/actions/blood-bank";
import { BLOOD_PRODUCT_SHORT, REACTION_LABELS, TRANSFUSION_REACTIONS, TRANSFUSION_STATUS_LABELS, bedsideChecks, type BloodProduct, type TransfusionReaction } from "@/lib/blood-bank";

type Transfusion = Extract<Awaited<ReturnType<typeof listTransfusions>>, { success: true }>["data"][number];
type Permissions = { reserve: boolean; administer: boolean };

const formatDateTime = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
const STATUS_STYLES: Record<string, string> = {
  RESERVED: "bg-blue-600 text-white",
  IN_PROGRESS: "bg-amber-500 text-white",
  COMPLETED: "bg-emerald-600 text-white",
  CANCELLED: "bg-slate-400 text-white",
};

function StartDialog({ t, onClose }: { t: Transfusion; onClose: () => void }) {
  const router = useRouter();
  const checks = bedsideChecks(t.product);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [preVitals, setPreVitals] = useState("");
  const [saving, setSaving] = useState(false);
  const allChecked = checks.every((c) => done[c.key]);

  const submit = async () => {
    setSaving(true);
    const res = await startTransfusion({ transfusionId: t.id, checks: done, preVitals: preVitals.trim() });
    setSaving(false);
    if (res.success) {
      toast.success("Transfusion commencée. Surveillez le patient, surtout les 15 premières minutes.");
      onClose();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Contrôle ultime au lit — {t.patientName}</DialogTitle>
        <DialogDescription>
          Poche {BLOOD_PRODUCT_SHORT[t.product as BloodProduct]} n° {t.unitNumber} ({t.unitGroup}) pour un patient {t.patientGroup}. Tous les points sont obligatoires.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {checks.map((c) => (
          <label key={c.key} className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!done[c.key]} onChange={(e) => setDone((s) => ({ ...s, [c.key]: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            {c.label}
          </label>
        ))}
        <div className="space-y-1.5 pt-2">
          <Label>Constantes de départ *</Label>
          <Input value={preVitals} onChange={(e) => setPreVitals(e.target.value)} placeholder="ex: TA 120/75, FC 88, T° 37,1, SpO₂ 97 %" className="rounded-xl" maxLength={300} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button disabled={!allChecked || preVitals.trim().length < 3 || saving} onClick={submit} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Poser la transfusion
        </Button>
      </DialogFooter>
    </>
  );
}

function CompleteDialog({ t, onClose }: { t: Transfusion; onClose: () => void }) {
  const router = useRouter();
  const [reaction, setReaction] = useState<TransfusionReaction>("NONE");
  const [details, setDetails] = useState("");
  const [postVitals, setPostVitals] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const res = await completeTransfusion({ transfusionId: t.id, reaction, reactionDetails: details.trim() || undefined, postVitals: postVitals.trim() });
    setSaving(false);
    if (res.success) {
      toast.success(res.data.incidentId ? "Transfusion terminée — incident d'hémovigilance déclaré." : "Transfusion terminée.");
      onClose();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fin de transfusion — {t.patientName}</DialogTitle>
        <DialogDescription>Tout effet indésirable est déclaré automatiquement comme incident d&apos;hémovigilance.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Effet indésirable</Label>
          <select value={reaction} onChange={(e) => setReaction(e.target.value as TransfusionReaction)} className="h-9 w-full px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {TRANSFUSION_REACTIONS.map((r) => (
              <option key={r} value={r}>
                {REACTION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {reaction !== "NONE" && (
          <div className="space-y-1.5">
            <Label>Description *</Label>
            <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Signes observés, heure, conduite tenue..." maxLength={1000} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Constantes de fin *</Label>
          <Input value={postVitals} onChange={(e) => setPostVitals(e.target.value)} placeholder="ex: TA 125/80, FC 84, T° 37,0" className="rounded-xl" maxLength={300} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button disabled={postVitals.trim().length < 3 || (reaction !== "NONE" && !details.trim()) || saving} onClick={submit} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Terminer
        </Button>
      </DialogFooter>
    </>
  );
}

// Transfusions de la clinique : en cours et réservées en tête, puis historique.
export default function TransfusionsView({ clinicId, transfusions, permissions }: { clinicId: string; transfusions: Transfusion[]; permissions: Permissions }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: "start" | "complete"; t: Transfusion } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const cancel = async (t: Transfusion) => {
    const res = await cancelTransfusion({ transfusionId: t.id, reason: cancelReason.trim() });
    if (res.success) {
      toast.success("Réservation annulée — poche remise en stock.");
      setCancelling(null);
      setCancelReason("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const order = ["IN_PROGRESS", "RESERVED", "COMPLETED", "CANCELLED"];
  const sorted = [...transfusions].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Aucune transfusion.</div>
      ) : (
        sorted.map((t) => (
          <div key={t.id} className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/50 p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  <Link href={`/dashboard/clinics/${clinicId}/patients/${t.patientId}`} className="hover:underline">
                    {t.patientName}
                  </Link>{" "}
                  <span className="text-xs font-mono text-muted-foreground">{t.ipp}</span>
                </p>
                <p className="text-sm">
                  {BLOOD_PRODUCT_SHORT[t.product as BloodProduct] ?? t.product} n° <span className="font-mono">{t.unitNumber}</span> • poche <b>{t.unitGroup}</b> → patient <b>{t.patientGroup}</b>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.indication} • RAI {t.antibodyScreen === "NEGATIVE" ? "négative" : "positive"} • cross-match {t.crossmatch === "COMPATIBLE" ? "compatible" : "non requis"}
                </p>
              </div>
              <Badge className={STATUS_STYLES[t.status]}>{TRANSFUSION_STATUS_LABELS[t.status] ?? t.status}</Badge>
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Réservée par {t.requestedByName ?? "-"} le {formatDateTime(t.createdAt)}</p>
              {t.startedAt && (
                <p>
                  Posée le {formatDateTime(t.startedAt)} par {t.bedsideCheckByName ?? "-"} — départ : {t.preVitals}
                </p>
              )}
              {t.endedAt && (
                <p>
                  Terminée le {formatDateTime(t.endedAt)} par {t.completedByName ?? "-"} — fin : {t.postVitals}
                </p>
              )}
              {t.status === "CANCELLED" && <p>Annulée : {t.cancelReason}</p>}
            </div>
            {t.reaction && t.reaction !== "NONE" && (
              <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {REACTION_LABELS[t.reaction as TransfusionReaction]} — {t.reactionDetails}
                {t.incidentId && (
                  <Link href={`/dashboard/clinics/${clinicId}/incidents`} className="underline ml-1">
                    incident déclaré
                  </Link>
                )}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {permissions.administer && t.status === "RESERVED" && (
                <Button size="sm" className="h-7 gap-1 rounded-lg text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setDialog({ kind: "start", t })}>
                  <PlayCircle className="h-3.5 w-3.5" />
                  Poser (contrôle au lit)
                </Button>
              )}
              {permissions.administer && t.status === "IN_PROGRESS" && (
                <Button size="sm" className="h-7 gap-1 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setDialog({ kind: "complete", t })}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Terminer
                </Button>
              )}
              {permissions.reserve &&
                t.status === "RESERVED" &&
                (cancelling === t.id ? (
                  <>
                    <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motif" className="h-7 w-48 text-xs rounded-lg" />
                    <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={cancelReason.trim().length < 3} onClick={() => cancel(t)}>
                      Confirmer
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCancelling(null)}>
                      Retour
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 rounded-lg text-xs text-red-600" onClick={() => setCancelling(t.id)}>
                    <XCircle className="h-3.5 w-3.5" />
                    Annuler la réservation
                  </Button>
                ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          {dialog?.kind === "start" && <StartDialog key={dialog.t.id} t={dialog.t} onClose={() => setDialog(null)} />}
          {dialog?.kind === "complete" && <CompleteDialog key={dialog.t.id} t={dialog.t} onClose={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
