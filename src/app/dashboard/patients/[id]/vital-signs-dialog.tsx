"use client";

import { useState } from "react";
import { Activity, Plus, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordVitalSign } from "@/actions/vitals";
import { toast } from "sonner";

interface VitalSignsDialogProps {
  patientId: string;
  appointmentId?: string;
  onSuccess?: (vital: any) => void;
}

export default function VitalSignsDialog({ patientId, appointmentId, onSuccess }: VitalSignsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [temperature, setTemperature] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [oxygenSaturation, setOxygenSaturation] = useState("");
  const [bloodSugar, setBloodSugar] = useState("");
  const [weight, setWeight] = useState("");
  const [painScore, setPainScore] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await recordVitalSign({
      patientId,
      appointmentId,
      temperature: temperature ? parseFloat(temperature) : undefined,
      bloodPressure: bloodPressure || undefined,
      heartRate: heartRate ? parseInt(heartRate, 10) : undefined,
      oxygenSaturation: oxygenSaturation ? parseInt(oxygenSaturation, 10) : undefined,
      bloodSugar: bloodSugar ? parseFloat(bloodSugar) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      painScore: painScore ? parseInt(painScore, 10) : undefined,
      notes: notes || undefined,
    });

    setLoading(false);
    if (!res.success) {
      toast.error(res.error);
    } else {
      toast.success("Constantes enregistrées avec succès.");
      onSuccess?.(res.data);
      setOpen(false);
      setTemperature("");
      setBloodPressure("");
      setHeartRate("");
      setOxygenSaturation("");
      setBloodSugar("");
      setWeight("");
      setPainScore("");
      setNotes("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10" />}>
        <HeartPulse className="h-4 w-4 text-emerald-500" />
        Prendre les constantes
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Activity className="h-5 w-5" />
            Enregistrer les constantes cliniques
          </DialogTitle>
          <DialogDescription>
            Saisissez les constantes vitales relevées lors de la consultation ou du soin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="temp">Température (°C)</Label>
              <Input
                id="temp"
                type="number"
                step="0.1"
                placeholder="ex: 37.5"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tension">Tension (mmHg)</Label>
              <Input
                id="tension"
                type="text"
                placeholder="ex: 120/80"
                value={bloodPressure}
                onChange={(e) => setBloodPressure(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pouls">Pouls / Fréquence (BPM)</Label>
              <Input
                id="pouls"
                type="number"
                placeholder="ex: 72"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spo2">Saturation (SpO2 %)</Label>
              <Input
                id="spo2"
                type="number"
                placeholder="ex: 98"
                value={oxygenSaturation}
                onChange={(e) => setOxygenSaturation(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="glycemie">Glycémie (g/L)</Label>
              <Input
                id="glycemie"
                type="number"
                step="0.01"
                placeholder="ex: 1.05"
                value={bloodSugar}
                onChange={(e) => setBloodSugar(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="douleur">Douleur (0 à 10)</Label>
              <Input
                id="douleur"
                type="number"
                min="0"
                max="10"
                placeholder="ex: 3"
                value={painScore}
                onChange={(e) => setPainScore(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="poids">Poids (kg)</Label>
            <Input
              id="poids"
              type="number"
              step="0.1"
              placeholder="ex: 70.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes / Observations complémentaires</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Patient calme, bonne tolérance du traitement..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? "Enregistrement..." : "Enregistrer les constantes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
