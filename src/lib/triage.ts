// Tri des urgences — échelle CIMU (Classification Infirmière des Malades aux Urgences), 5 niveaux.
// Le niveau est TOUJOURS choisi par le soignant : l'application ne le calcule pas, elle affiche la
// grille, le délai cible et le dépassement éventuel.

export interface TriageLevelInfo {
  level: number;
  label: string;
  description: string;
  // Délai maximal recommandé avant prise en charge médicale (minutes) ; 0 = immédiat.
  targetMinutes: number;
  color: string;
}

export const TRIAGE_LEVELS: TriageLevelInfo[] = [
  { level: 1, label: "Vitale immédiate", description: "Détresse vitale majeure : prise en charge sans délai.", targetMinutes: 0, color: "red" },
  { level: 2, label: "Très urgent", description: "Atteinte vitale potentielle ou douleur intense.", targetMinutes: 20, color: "orange" },
  { level: 3, label: "Urgent", description: "Atteinte fonctionnelle ou lésion organique, état stable.", targetMinutes: 60, color: "yellow" },
  { level: 4, label: "Peu urgent", description: "Pas d'atteinte fonctionnelle, nécessite un acte (suture, plâtre...).", targetMinutes: 120, color: "green" },
  { level: 5, label: "Non urgent", description: "Ni atteinte fonctionnelle ni acte : consultation possible.", targetMinutes: 240, color: "blue" },
];

export function triageLevelInfo(level: number | null | undefined): TriageLevelInfo | null {
  return TRIAGE_LEVELS.find((l) => l.level === level) ?? null;
}

// Classes Tailwind par niveau (badge et bordure de carte).
export const TRIAGE_STYLES: Record<number, { badge: string; border: string }> = {
  1: { badge: "bg-red-600 text-white", border: "border-red-500" },
  2: { badge: "bg-orange-500 text-white", border: "border-orange-400" },
  3: { badge: "bg-yellow-400 text-slate-900", border: "border-yellow-400" },
  4: { badge: "bg-emerald-500 text-white", border: "border-emerald-400" },
  5: { badge: "bg-blue-500 text-white", border: "border-blue-400" },
};

// Minutes écoulées depuis l'arrivée, et dépassement du délai cible du niveau.
export function triageDelay(level: number | null | undefined, arrivedAt: Date | string, now: Date = new Date()) {
  const waited = Math.max(0, Math.floor((now.getTime() - new Date(arrivedAt).getTime()) / 60000));
  const info = triageLevelInfo(level);
  return { waitedMinutes: waited, overdue: info ? waited > info.targetMinutes : false };
}

// Ordre du tableau des urgences : patients pas encore triés d'abord (à trier au plus vite), puis
// par niveau (1 → 5), puis par ordre d'arrivée.
export function compareEmergency(
  a: { triageLevel: number | null; arrivedAt: Date | string },
  b: { triageLevel: number | null; arrivedAt: Date | string }
): number {
  const rank = (lvl: number | null) => (lvl == null ? 0 : lvl);
  return rank(a.triageLevel) - rank(b.triageLevel) || new Date(a.arrivedAt).getTime() - new Date(b.arrivedAt).getTime();
}

// Bornes de PLAUSIBILITÉ de saisie (fautes de frappe), pas des seuils cliniques.
export const VITAL_BOUNDS = {
  temperature: [25, 45],
  heartRate: [10, 300],
  respiratoryRate: [2, 90],
  oxygenSaturation: [30, 100],
  bloodSugar: [0.1, 10],
  painScore: [0, 10],
  glasgow: [3, 15],
} as const;

export function isPlausibleBloodPressure(value: string): boolean {
  const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(value.trim());
  if (!m) return false;
  const [sys, dia] = [Number(m[1]), Number(m[2])];
  return sys >= 40 && sys <= 300 && dia >= 20 && dia <= 200 && sys > dia;
}
