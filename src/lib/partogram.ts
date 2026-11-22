// Partogramme OMS — règles pures (graphique, alertes), partagées par l'écran et les tests.
//
// Phase active : à partir de 4 cm. La ligne d'ALERTE part de la première dilatation ≥ 4 cm et
// progresse de 1 cm/heure ; la ligne d'ACTION lui est parallèle, 4 heures à droite. Une dilatation
// passée à droite de la ligne d'alerte signale un travail qui traîne ; à droite de la ligne
// d'action, une décision s'impose (avis médical, transfert, césarienne...).

export type PartogramPoint = {
  recordedAt: string;
  cervicalDilation?: number | null;
  fetalHeartRate?: number | null;
  contractionsPer10?: number | null;
  maternalPulse?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  temperature?: number | null;
  amnioticFluid?: string | null;
};

const HOUR = 3600_000;
export const ACTIVE_PHASE_CM = 4;
export const ACTION_LINE_OFFSET_H = 4;

export function alertLineStart(points: PartogramPoint[]): { at: number; cm: number } | null {
  const first = [...points]
    .filter((p) => p.cervicalDilation != null && p.cervicalDilation >= ACTIVE_PHASE_CM)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())[0];
  return first ? { at: new Date(first.recordedAt).getTime(), cm: first.cervicalDilation! } : null;
}

// Dilatation attendue sur la ligne d'alerte (ou d'action, offsetH = 4) à l'instant t.
export function expectedDilation(start: { at: number; cm: number }, t: number, offsetH = 0): number {
  return Math.min(10, start.cm + (t - start.at - offsetH * HOUR) / HOUR);
}

export type PartogramAlert = { level: "warning" | "danger"; message: string };

export function partogramAlerts(points: PartogramPoint[]): PartogramAlert[] {
  const alerts: PartogramAlert[] = [];
  const sorted = [...points].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const start = alertLineStart(sorted);
  const lastDil = [...sorted].reverse().find((p) => p.cervicalDilation != null);
  if (start && lastDil && lastDil.cervicalDilation! < 10) {
    const t = new Date(lastDil.recordedAt).getTime();
    if (lastDil.cervicalDilation! < expectedDilation(start, t, ACTION_LINE_OFFSET_H)) {
      alerts.push({ level: "danger", message: "Ligne d'action franchie : décision obstétricale à prendre (avis médical, transfert, césarienne)." });
    } else if (lastDil.cervicalDilation! < expectedDilation(start, t)) {
      alerts.push({ level: "warning", message: "Ligne d'alerte franchie : la dilatation progresse moins de 1 cm/heure." });
    }
  }
  const last = sorted[sorted.length - 1];
  if (last) {
    if (last.fetalHeartRate != null && (last.fetalHeartRate < 110 || last.fetalHeartRate > 160)) {
      alerts.push({ level: "danger", message: `Rythme cardiaque fœtal anormal (${last.fetalHeartRate} bpm, normal 110–160).` });
    }
    if (last.amnioticFluid === "M") alerts.push({ level: "warning", message: "Liquide méconial : surveillance fœtale rapprochée." });
    if ((last.systolicBp ?? 0) >= 140 || (last.diastolicBp ?? 0) >= 90) alerts.push({ level: "danger", message: "Tension élevée (≥ 140/90) : risque de pré-éclampsie." });
    if ((last.temperature ?? 0) >= 38) alerts.push({ level: "warning", message: `Fièvre maternelle (${last.temperature} °C).` });
    if ((last.maternalPulse ?? 0) > 100) alerts.push({ level: "warning", message: `Pouls maternel rapide (${last.maternalPulse}/min).` });
  }
  return alerts;
}
