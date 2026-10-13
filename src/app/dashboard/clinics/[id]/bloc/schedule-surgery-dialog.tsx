"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listSurgeryStaff, scheduleSurgery } from "@/actions/surgery";
import { ANESTHESIA_LABELS, ANESTHESIA_TYPES, LATERALITIES, LATERALITY_LABELS, type AnesthesiaType, type Laterality } from "@/lib/surgery";
import PatientSearchField, { type FoundPatient } from "@/components/patients/patient-search-field";

type Option = { id: string; name: string };
const selectClass = "h-9 w-full px-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";

// Programmation d'une intervention : salle, créneau, équipe et forfait (facturé à la caisse dès la
// programmation). Les chevauchements de salle ou d'équipe sont refusés côté serveur.
export default function ScheduleSurgeryDialog({ clinicId, rooms, defaultDate }: { clinicId: string; rooms: Option[]; defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<FoundPatient | null>(null);
  const [staff, setStaff] = useState<{ doctors: Option[]; nurses: Option[] } | null>(null);
  const [form, setForm] = useState({
    operatingRoomId: rooms[0]?.id ?? "",
    date: defaultDate,
    time: "08:00",
    duration: "60",
    procedure: "",
    indication: "",
    laterality: "NA" as Laterality,
    anesthesiaType: "GENERAL" as AnesthesiaType,
    urgent: false,
    surgeonId: "",
    anesthetistId: "",
    scrubNurseId: "",
    fee: "",
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open || staff) return;
    let cancelled = false;
    listSurgeryStaff(clinicId).then((res) => {
      if (!cancelled) setStaff(res.success ? res.data : { doctors: [], nurses: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [open, staff, clinicId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) {
      toast.error("Sélectionnez le patient.");
      return;
    }
    const fee = form.fee.trim() === "" ? 0 : Number(form.fee.replace(/\s/g, ""));
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error("Forfait invalide.");
      return;
    }
    setSaving(true);
    const res = await scheduleSurgery({
      patientId: patient.id,
      operatingRoomId: form.operatingRoomId,
      date: form.date,
      time: form.time,
      durationMinutes: Number(form.duration),
      procedure: form.procedure.trim(),
      indication: form.indication.trim() || undefined,
      laterality: form.laterality,
      anesthesiaType: form.anesthesiaType,
      priority: form.urgent ? "URGENT" : "SCHEDULED",
      surgeonId: form.surgeonId,
      anesthetistId: form.anesthetistId || undefined,
      scrubNurseId: form.scrubNurseId || undefined,
      fee,
    });
    setSaving(false);
    if (res.success) {
      toast.success(fee > 0 ? "Intervention programmée — forfait transmis à la caisse." : "Intervention programmée.");
      setOpen(false);
      setPatient(null);
      setForm((f) => ({ ...f, procedure: "", indication: "", fee: "", urgent: false }));
      router.push(`/dashboard/clinics/${clinicId}/bloc?date=${res.data.date}`);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 rounded-xl" disabled={rooms.length === 0} />}>
        <CalendarPlus className="h-4 w-4" />
        Programmer une intervention
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programmer une intervention</DialogTitle>
          <DialogDescription>Le forfait éventuel est facturé à la caisse dès la programmation.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Patient *</Label>
          <PatientSearchField clinicId={clinicId} value={patient} onChange={setPatient} autoFocus />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="procedure">Intervention *</Label>
            <Input id="procedure" required value={form.procedure} onChange={(e) => set("procedure", e.target.value)} placeholder="ex: Appendicectomie par laparoscopie" className="rounded-xl" maxLength={200} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Salle *</Label>
              <select value={form.operatingRoomId} onChange={(e) => set("operatingRoomId", e.target.value)} className={selectClass}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Côté</Label>
              <select value={form.laterality} onChange={(e) => set("laterality", e.target.value as Laterality)} className={selectClass}>
                {LATERALITIES.map((l) => (
                  <option key={l} value={l}>
                    {LATERALITY_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Anesthésie</Label>
              <select value={form.anesthesiaType} onChange={(e) => set("anesthesiaType", e.target.value as AnesthesiaType)} className={selectClass}>
                {ANESTHESIA_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {ANESTHESIA_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Heure *</Label>
              <Input type="time" required value={form.time} onChange={(e) => set("time", e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Durée (min) *</Label>
              <Input type="number" min={10} max={1440} step={5} required value={form.duration} onChange={(e) => set("duration", e.target.value)} className="h-9 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Forfait (FCFA)</Label>
              <Input inputMode="numeric" value={form.fee} onChange={(e) => set("fee", e.target.value)} placeholder="0" className="h-9 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Chirurgien *</Label>
              <select required value={form.surgeonId} onChange={(e) => set("surgeonId", e.target.value)} className={selectClass}>
                <option value="">{staff ? "Choisir..." : "Chargement..."}</option>
                {staff?.doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Anesthésiste</Label>
              <select value={form.anesthetistId} onChange={(e) => set("anesthetistId", e.target.value)} className={selectClass}>
                <option value="">—</option>
                {staff?.doctors
                  .filter((d) => d.id !== form.surgeonId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Infirmier(e) de bloc</Label>
              <select value={form.scrubNurseId} onChange={(e) => set("scrubNurseId", e.target.value)} className={selectClass}>
                <option value="">—</option>
                {staff?.nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="indication">Indication</Label>
            <Textarea id="indication" rows={2} value={form.indication} onChange={(e) => set("indication", e.target.value)} maxLength={1000} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.urgent} onChange={(e) => set("urgent", e.target.checked)} className="h-4 w-4 accent-red-600" />
            Intervention urgente
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !patient} className="gap-2 rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Programmer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
