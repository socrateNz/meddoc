// Accueil & file d'attente — règles pures (aucun accès base), partagées par les actions, l'écran
// d'accueil et leurs tests.

export const VISIT_DESTINATIONS = ["CONSULTATION", "EMERGENCY", "LAB", "PHARMACY", "NURSING", "ADMINISTRATIVE"] as const;
export type VisitDestination = (typeof VISIT_DESTINATIONS)[number];

export const VISIT_DESTINATION_LABELS: Record<VisitDestination, string> = {
  CONSULTATION: "Consultation",
  EMERGENCY: "Urgences",
  LAB: "Laboratoire",
  PHARMACY: "Pharmacie",
  NURSING: "Soins infirmiers",
  ADMINISTRATIVE: "Administratif / Caisse",
};

export const VISIT_STATUSES = ["WAITING", "CALLED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  WAITING: "En attente",
  CALLED: "Appelé",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
  CANCELLED: "Parti / annulé",
};

// Un passage « actif » occupe la file : un même patient ne peut pas y être deux fois le même jour.
export const ACTIVE_VISIT_STATUSES: VisitStatus[] = ["WAITING", "CALLED", "IN_PROGRESS"];

export type VisitAction = "CALL" | "START" | "COMPLETE" | "CANCEL" | "REQUEUE";

// Transitions autorisées : appeler un patient en attente, le prendre en charge (directement ou
// après appel), terminer, le remettre en attente s'il ne s'est pas présenté à l'appel, ou noter
// son départ (« parti sans être vu ») tant qu'il n'est pas terminé.
const TRANSITIONS: Record<VisitAction, { from: VisitStatus[]; to: VisitStatus }> = {
  CALL: { from: ["WAITING"], to: "CALLED" },
  START: { from: ["WAITING", "CALLED"], to: "IN_PROGRESS" },
  COMPLETE: { from: ["IN_PROGRESS"], to: "DONE" },
  REQUEUE: { from: ["CALLED"], to: "WAITING" },
  CANCEL: { from: ["WAITING", "CALLED", "IN_PROGRESS"], to: "CANCELLED" },
};

export function nextVisitStatus(current: string, action: VisitAction): VisitStatus | null {
  const rule = TRANSITIONS[action];
  return rule && (rule.from as string[]).includes(current) ? rule.to : null;
}

export function formatTicket(ticketNumber: number): string {
  return String(ticketNumber).padStart(3, "0");
}

// Ordre de la file : les urgences d'abord, puis par ordre d'arrivée.
export function compareQueue(
  a: { priority: string; arrivedAt: Date | string },
  b: { priority: string; arrivedAt: Date | string }
): number {
  const urgency = (p: string) => (p === "URGENT" ? 0 : 1);
  return urgency(a.priority) - urgency(b.priority) || new Date(a.arrivedAt).getTime() - new Date(b.arrivedAt).getTime();
}

// Attente écoulée, lisible : « 12 min », « 1 h 05 ».
export function formatWait(from: Date | string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}
