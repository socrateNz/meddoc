"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Droplet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listCompatibleUnits, reserveBloodUnit } from "@/actions/blood-bank";
import { ABO_GROUPS, BLOOD_PRODUCTS, BLOOD_PRODUCT_LABELS, RHESUS, parseBloodType, requiresCrossmatch, type AboGroup, type BloodProduct, type Rhesus } from "@/lib/blood-bank";
import PatientSearchField, { type FoundPatient } from "@/components/patients/patient-search-field";

type CompatibleUnit = { id: string; unitNumber: string; group: string; expiresAt: string; volumeMl: number | null; price: number; warning: string | null };
const selectClass = "h-9 w-full px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
const formatDate = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(d));

// Réservation d'une poche pour un patient : groupe confirmé, RAI, cross-match, puis choix parmi les
// seules poches compatibles et non périmées (revérifié côté serveur).
export default function ReserveUnitDialog({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<FoundPatient | null>(null);
  const [product, setProduct] = useState<BloodProduct>("RBC");
  const [abo, setAbo] = useState<AboGroup | "">("");
  const [rh, setRh] = useState<Rhesus | "">("");
  const [antibodyScreen, setAntibodyScreen] = useState<"NEGATIVE" | "POSITIVE" | "">("");
  const [crossmatch, setCrossmatch] = useState<"COMPATIBLE" | "INCOMPATIBLE" | "">("");
  const [indication, setIndication] = useState("");
  const [units, setUnits] = useState<CompatibleUnit[] | null>(null);
  const [unitId, setUnitId] = useState("");
  const [saving, setSaving] = useState(false);

  const choosePatient = (p: FoundPatient | null) => {
    setPatient(p);
    const g = parseBloodType(p?.bloodType);
    setAbo(g?.abo ?? "");
    setRh(g?.rh ?? "");
    setUnitId("");
  };

  useEffect(() => {
    if (!patient || !abo || !rh) return;
    let cancelled = false;
    listCompatibleUnits({ patientId: patient.id, product, patientAboGroup: abo, patientRhesus: rh }).then((res) => {
      if (cancelled) return;
      if (!res.success) toast.error(res.error);
      setUnits(res.success ? res.data : []);
      setUnitId("");
    });
    return () => {
      cancelled = true;
    };
  }, [patient, product, abo, rh]);

  const needsCrossmatch = requiresCrossmatch(product);
  const ready = patient && abo && rh && antibodyScreen && unitId && indication.trim().length >= 3 && (!needsCrossmatch || crossmatch);

  const submit = async () => {
    if (!patient || !abo || !rh || !antibodyScreen) return;
    setSaving(true);
    const res = await reserveBloodUnit({
      patientId: patient.id,
      unitId,
      indication: indication.trim(),
      patientAboGroup: abo,
      patientRhesus: rh,
      antibodyScreen,
      crossmatch: needsCrossmatch ? (crossmatch as "COMPATIBLE" | "INCOMPATIBLE") : "NOT_REQUIRED",
    });
    setSaving(false);
    if (res.success) {
      toast.success("Poche réservée pour le patient.");
      setOpen(false);
      choosePatient(null);
      setIndication("");
      setAntibodyScreen("");
      setCrossmatch("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white" />}>
        <Droplet className="h-4 w-4" />
        Réserver une poche
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réserver une poche pour un patient</DialogTitle>
          <DialogDescription>Contrôles pré-transfusionnels, puis choix d&apos;une poche compatible.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Patient *</Label>
            <PatientSearchField clinicId={clinicId} value={patient} onChange={choosePatient} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Produit *</Label>
              <select value={product} onChange={(e) => setProduct(e.target.value as BloodProduct)} className={selectClass}>
                {BLOOD_PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {BLOOD_PRODUCT_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Groupe du patient (confirmé) *</Label>
              <select value={abo} onChange={(e) => setAbo(e.target.value as AboGroup)} className={selectClass}>
                <option value="">—</option>
                {ABO_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Rhésus du patient *</Label>
              <select value={rh} onChange={(e) => setRh(e.target.value as Rhesus)} className={selectClass}>
                <option value="">—</option>
                {RHESUS.map((r) => (
                  <option key={r} value={r}>
                    {r === "POS" ? "RhD +" : "RhD -"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>RAI (Coombs indirect) *</Label>
              <select value={antibodyScreen} onChange={(e) => setAntibodyScreen(e.target.value as "NEGATIVE" | "POSITIVE")} className={selectClass}>
                <option value="">—</option>
                <option value="NEGATIVE">Négative</option>
                <option value="POSITIVE">Positive</option>
              </select>
            </div>
            {needsCrossmatch && (
              <div className="space-y-1.5">
                <Label>Cross-match *</Label>
                <select value={crossmatch} onChange={(e) => setCrossmatch(e.target.value as "COMPATIBLE" | "INCOMPATIBLE")} className={selectClass}>
                  <option value="">—</option>
                  <option value="COMPATIBLE">Compatible</option>
                  <option value="INCOMPATIBLE">Incompatible</option>
                </select>
              </div>
            )}
          </div>
          {antibodyScreen === "POSITIVE" && <p className="text-xs text-amber-700">RAI positive : identification de l&apos;anticorps et avis du biologiste recommandés avant la transfusion.</p>}
          {crossmatch === "INCOMPATIBLE" && <p className="text-xs font-semibold text-red-600">Cross-match incompatible : cette poche ne peut pas être transfusée.</p>}

          <div className="space-y-1.5">
            <Label>Indication *</Label>
            <Input value={indication} onChange={(e) => setIndication(e.target.value)} placeholder="ex: Anémie aiguë, Hb 6,2 g/dL" className="rounded-xl" maxLength={500} />
          </div>

          {patient && abo && rh && (
            <div className="space-y-1.5">
              <Label>Poche compatible *</Label>
              {units === null ? (
                <p className="text-xs text-muted-foreground">Recherche...</p>
              ) : units.length === 0 ? (
                <p className="text-xs font-semibold text-red-600">Aucune poche compatible et non périmée en stock pour ce produit.</p>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {units.map((u) => (
                    <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${unitId === u.id ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <input type="radio" name="unit" checked={unitId === u.id} onChange={() => setUnitId(u.id)} className="accent-red-600" />
                      <span className="font-black w-10">{u.group}</span>
                      <span className="text-sm font-mono flex-1">n° {u.unitNumber}</span>
                      <span className="text-xs text-muted-foreground">périme le {formatDate(u.expiresAt)}</span>
                      {u.warning && <span className="text-[10px] text-amber-700 block">{u.warning}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
            Annuler
          </Button>
          <Button disabled={!ready || saving || crossmatch === "INCOMPATIBLE"} onClick={submit} className="gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Droplet className="h-4 w-4" />}
            Réserver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
