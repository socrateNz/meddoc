import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import CreateIncidentDialog from "@/app/dashboard/incidents/create-incident-dialog";
import IncidentRowActions from "@/app/dashboard/incidents/incident-row-actions";
import { Priority, IncidentStatus, Incident, Patient, User } from "@prisma/client";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    priority?: string;
    status?: string;
  }>;
}

export default async function ClinicIncidentsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const clinicId = resolvedParams.id;
  const priorityFilter = resolvedSearchParams.priority;
  const statusFilter = resolvedSearchParams.status;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  // Build filter query scoped to this clinic
  const where: any = {
    patient: {
      organizationId: clinicId
    }
  };
  
  if (priorityFilter && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priorityFilter)) {
    where.priority = priorityFilter as Priority;
  }
  if (statusFilter && ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(statusFilter)) {
    where.status = statusFilter as IncidentStatus;
  }

  // Les 2 requêtes ci-dessous sont indépendantes, on les lance en parallèle.
  const [incidents, patients] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: {
        patient: {
          include: { user: true }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 500,
    }),
    prisma.patient.findMany({
      where: {
        organizationId: clinicId
      },
      include: { user: true },
      orderBy: {
        user: {
          lastName: "asc"
        }
      }
    }),
  ]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case "LOW":
        return <Badge variant="secondary">Faible</Badge>;
      case "MEDIUM":
        return <Badge variant="outline" className="border-amber-500/20 text-amber-600 bg-amber-500/5">Moyenne</Badge>;
      case "HIGH":
        return <Badge variant="destructive" className="bg-orange-500 hover:bg-orange-600">Élevée</Badge>;
      case "CRITICAL":
        return <Badge variant="destructive" className="bg-red-600 animate-pulse hover:bg-red-700">Critique</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  const getStatusIcon = (status: IncidentStatus) => {
    switch (status) {
      case "OPEN":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "IN_PROGRESS":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "RESOLVED":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    }
  };

  const getStatusClass = (status: IncidentStatus) => {
    switch (status) {
      case "OPEN":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "IN_PROGRESS":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "RESOLVED":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents & Alertes</h1>
          <p className="text-muted-foreground">
            Suivi des incidents et des alertes de sécurité des patients pour cette clinique.
          </p>
        </div>
        <CreateIncidentDialog patients={patients} reportedById={currentUser.id} />
      </div>

      {/* Filter panel */}
      <div className="flex flex-wrap gap-4 items-center bg-card border border-border/40 p-4 rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut :</span>
          <div className="flex rounded-lg border bg-background p-1 text-xs gap-1">
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${!statusFilter ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Tous
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?status=OPEN${priorityFilter ? `&priority=${priorityFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${statusFilter === "OPEN" ? "bg-destructive text-destructive-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              À traiter
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?status=IN_PROGRESS${priorityFilter ? `&priority=${priorityFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${statusFilter === "IN_PROGRESS" ? "bg-amber-500 text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              En cours
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?status=RESOLVED${priorityFilter ? `&priority=${priorityFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${statusFilter === "RESOLVED" ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Résolus
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priorité :</span>
          <div className="flex rounded-lg border bg-background p-1 text-xs gap-1">
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents${statusFilter ? `?status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${!priorityFilter ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Toutes
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?priority=CRITICAL${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "CRITICAL" ? "bg-red-600 text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Critique
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?priority=HIGH${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "HIGH" ? "bg-orange-500 text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Élevée
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?priority=MEDIUM${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "MEDIUM" ? "bg-amber-500 text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Moyenne
            </Link>
            <Link
              href={`/dashboard/clinics/${clinicId}/incidents?priority=LOW${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "LOW" ? "bg-slate-500 text-white shadow" : "text-muted-foreground hover:bg-muted"}`}
            >
              Faible
            </Link>
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Incident</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Date de signalement</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Aucun incident trouvé avec ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              incidents.map((incident) => (
                <TableRow key={incident.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">
                    {incident.patient.user.lastName} {incident.patient.user.firstName}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">{incident.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{incident.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getPriorityBadge(incident.priority)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(incident.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`gap-1.5 items-center ${getStatusClass(incident.status)}`}>
                      {getStatusIcon(incident.status)}
                      <span>
                        {incident.status === "OPEN" ? "À traiter" : incident.status === "IN_PROGRESS" ? "En cours" : "Résolu"}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <IncidentRowActions incidentId={incident.id} currentStatus={incident.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
