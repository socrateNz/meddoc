"use client";

import Link from "next/link";
import { Activity, HeartPulse, Thermometer, Droplet, Weight, AlertCircle, Stethoscope } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VitalSignItem {
  id: string;
  temperature?: number | null;
  bloodPressure?: string | null;
  heartRate?: number | null;
  oxygenSaturation?: number | null;
  bloodSugar?: number | null;
  weight?: number | null;
  painScore?: number | null;
  notes?: string | null;
  createdAt: Date;
  recordedBy?: {
    firstName: string;
    lastName: string;
    role: string;
  };
  appointment?: {
    id: string;
    title: string;
    scheduledAt: Date;
  } | null;
}

interface VitalSignsChartProps {
  vitalSigns: VitalSignItem[];
}

export default function VitalSignsChart({ vitalSigns }: VitalSignsChartProps) {
  if (!vitalSigns || vitalSigns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          <HeartPulse className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="font-medium text-sm">Aucune constante enregistrée pour le moment.</p>
          <p className="text-xs">Cliquez sur &quot;Prendre les constantes&quot; ci-dessus pour effectuer un premier relevé.</p>
        </CardContent>
      </Card>
    );
  }

  const latest = vitalSigns[0];

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      {/* Cards des dernières constantes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5" /> Température
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {latest.temperature ? `${latest.temperature} °C` : "---"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <HeartPulse className="h-3.5 w-3.5" /> Tension & Pouls
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {latest.bloodPressure || "---"}
            </div>
            {latest.heartRate && (
              <span className="text-xs text-muted-foreground">{latest.heartRate} BPM</span>
            )}
          </CardContent>
        </Card>

        <Card className="bg-indigo-500/5 border-indigo-500/20">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Saturation SpO2
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {latest.oxygenSaturation ? `${latest.oxygenSaturation} %` : "---"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Échelle Douleur
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {latest.painScore !== null && latest.painScore !== undefined ? `${latest.painScore} / 10` : "---"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historique Chronologique */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Historique de l&apos;évolution des constantes
          </CardTitle>
          <CardDescription>
            Toutes les prises de constantes enregistrées au cours du traitement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {vitalSigns.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatDateTime(item.createdAt)}
                    </span>
                    {item.recordedBy && (
                      <Badge variant="outline" className="text-[10px]">
                        Par {item.recordedBy.firstName} {item.recordedBy.lastName}
                      </Badge>
                    )}
                    {item.appointment && (
                      <Link href={`/dashboard/appointments/${item.appointment.id}/consultation`}>
                        <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                          <Stethoscope className="h-2.5 w-2.5" />
                          {item.appointment.title}
                        </Badge>
                      </Link>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300 pt-1">
                    {item.temperature && <span>Temp: <strong>{item.temperature}°C</strong></span>}
                    {item.bloodPressure && <span>Tension: <strong>{item.bloodPressure}</strong></span>}
                    {item.heartRate && <span>Pouls: <strong>{item.heartRate} BPM</strong></span>}
                    {item.oxygenSaturation && <span>SpO2: <strong>{item.oxygenSaturation}%</strong></span>}
                    {item.bloodSugar && <span>Glycémie: <strong>{item.bloodSugar} g/L</strong></span>}
                    {item.weight && <span>Poids: <strong>{item.weight} kg</strong></span>}
                    {item.painScore !== null && item.painScore !== undefined && (
                      <span>Douleur: <strong className="text-amber-600">{item.painScore}/10</strong></span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="text-muted-foreground italic pt-1 text-[11px]">
                      &quot;{item.notes}&quot;
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
