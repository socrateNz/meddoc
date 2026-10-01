"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Calendar as CalendarIcon,
  User as UserIcon,
  Stethoscope,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { CalendarAppointment, AppointmentCaregiver, getCaregiverColor } from "./types";
import { formatDateTime, formatTime, getEndTime } from "./date-utils";
import { updateAppointmentStatus, deleteAppointment } from "@/actions/appointments";
import { toast } from "sonner";
import EditAppointmentDialog from "./edit-appointment-dialog";

interface AppointmentDetailDialogProps {
  appointment: CalendarAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caregivers: AppointmentCaregiver[];
  onSuccess?: () => void;
}

export default function AppointmentDetailDialog({
  appointment,
  open,
  onOpenChange,
  caregivers,
  onSuccess,
}: AppointmentDetailDialogProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!appointment) return null;

  const colorMeta = getCaregiverColor(appointment.caregiverId);
  const endTime = getEndTime(appointment.scheduledAt, appointment.durationMinutes);

  const handleStatusChange = async (newStatus: string) => {
    setStatusLoading(true);
    try {
      const res = await updateAppointmentStatus(appointment.id, newStatus);
      if (res.success) {
        toast.success(`Statut mis à jour : ${newStatus}`);
        onSuccess?.();
      } else {
        toast.error(res.error || "Impossible de mettre à jour le statut");
      }
    } catch {
      toast.error("Erreur inattendue");
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await deleteAppointment(appointment.id);
      if (res.success) {
        toast.success("Rendez-vous supprimé");
        setConfirmDelete(false);
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "Impossible de supprimer le rendez-vous");
      }
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Terminé</Badge>;
      case "IN_PROGRESS":
        return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">En cours</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/30">Annulé</Badge>;
      default:
        return <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Planifié</Badge>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden bg-card border border-border/70 shadow-2xl rounded-2xl">
          {/* Outlook accent header bar */}
          <div className={`h-2.5 w-full ${colorMeta.border.replace("border-l-", "bg-")}`} />

          <div className="p-6 space-y-6">
            {/* Header info */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(appointment.status)}
                  <Badge variant="outline" className="font-normal text-xs">
                    {appointment.type}
                  </Badge>
                </div>
                <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                  {appointment.title}
                </DialogTitle>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="gap-1.5 h-9 shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </Button>
            </div>

            {/* Time information block - Outlook style */}
            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/40 border border-border/50">
              <div className="p-2 rounded-lg bg-background shadow-xs text-primary shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div className="text-sm space-y-0.5">
                <p className="font-semibold text-foreground capitalize">
                  {formatDateTime(appointment.scheduledAt)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatTime(appointment.scheduledAt)} - {formatTime(endTime)} ({appointment.durationMinutes} min)
                </p>
              </div>
            </div>

            {/* Patient & Practitioner Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Patient */}
              <div className="p-4 rounded-xl border border-border/60 bg-card space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient</span>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-semibold">
                    {appointment.patient.user.firstName?.[0] || ""}{appointment.patient.user.lastName?.[0] || "P"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {appointment.patient.user.lastName} {appointment.patient.user.firstName}
                    </p>
                    <Link
                      href={`/dashboard/patients/${appointment.patientId}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                    >
                      Dossier patient <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Soignant */}
              <div className="p-4 rounded-xl border border-border/60 bg-card space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Praticien / Soignant</span>
                {appointment.caregiver ? (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0 font-semibold">
                      <Stethoscope className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate text-foreground">
                        Dr. {appointment.caregiver.user.lastName} {appointment.caregiver.user.firstName}
                      </p>
                      <p className="text-xs text-muted-foreground">Praticien référent</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1 text-sm text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Non assigné</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Status Bar */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Changer le statut rapide</span>
              <div className="flex flex-wrap items-center gap-2">
                {appointment.status !== "SCHEDULED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusLoading}
                    onClick={() => handleStatusChange("SCHEDULED")}
                    className="text-xs h-8"
                  >
                    Marquer planifié
                  </Button>
                )}
                {appointment.status !== "IN_PROGRESS" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusLoading}
                    onClick={() => handleStatusChange("IN_PROGRESS")}
                    className="text-xs h-8 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                  >
                    En cours
                  </Button>
                )}
                {appointment.status !== "COMPLETED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusLoading}
                    onClick={() => handleStatusChange("COMPLETED")}
                    className="text-xs h-8 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Marquer terminé
                  </Button>
                )}
                {appointment.status !== "CANCELLED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusLoading}
                    onClick={() => handleStatusChange("CANCELLED")}
                    className="text-xs h-8 text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Annuler le RDV
                  </Button>
                )}
              </div>
            </div>

            {/* Actions footer */}
            <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
              {confirmDelete ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-destructive font-medium">Confirmer ?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteLoading}
                    onClick={handleDelete}
                    className="h-8"
                  >
                    {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Oui, supprimer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    className="h-8"
                  >
                    Non
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-destructive hover:bg-destructive/10 text-xs gap-1.5 h-8 w-full sm:w-auto justify-start sm:justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer le rendez-vous
                </Button>
              )}

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {appointment.status !== "COMPLETED" && (
                  <Button asChild className="gap-2 shadow-sm w-full sm:w-auto">
                    <Link href={`/dashboard/appointments/${appointment.id}/consultation`}>
                      <Stethoscope className="h-4 w-4" />
                      Ouvrir la consultation
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditAppointmentDialog
        appointment={appointment}
        open={editOpen}
        onOpenChange={setEditOpen}
        caregivers={caregivers}
        onSuccess={() => {
          onSuccess?.();
          onOpenChange(false);
        }}
      />
    </>
  );
}
