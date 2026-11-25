// Pages de destination des notifications (Notification.link) : ouvertes au clic dans la liste des
// notifications, sur le tableau de bord et depuis la notification push (cf. public/sw.js).
// Module pur (sans base ni événements) : importé par src/lib/events.ts et src/lib/scheduler.ts.

export type NotificationEntry = { userId: string; title: string; message: string; type: string; link?: string | null };

// Pages de destination des notifications (cf. Notification.link).
export const notificationLinks = {
  patient: (patientId: string, organizationId: string | null | undefined) =>
    organizationId ? `/dashboard/clinics/${organizationId}/patients/${patientId}` : `/dashboard/patients/${patientId}`,
  appointments: (organizationId: string | null | undefined) =>
    organizationId ? `/dashboard/clinics/${organizationId}/appointments` : "/dashboard/appointments",
  // Compte patient / proche : son espace (accueil du portail) liste ses rendez-vous.
  portal: () => "/dashboard",
  incidents: (organizationId: string) => `/dashboard/clinics/${organizationId}/incidents`,
  labOrder: (labOrderId: string) => `/dashboard/lab/${labOrderId}`,
  pharmacy: (organizationId: string) => `/dashboard/clinics/${organizationId}/pharmacie`,
};
