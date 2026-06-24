import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import CreateIncidentDialog from "./create-incident-dialog";
import IncidentRowActions from "./incident-row-actions";
import { Priority, IncidentStatus, Incident, Patient, User } from "@prisma/client";

interface PageProps {
  searchParams: Promise<{
    priority?: string;
    status?: string;
  }>;
}

export default async function IncidentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  const priorityFilter = params.priority;
  const statusFilter = params.status;

  // Build filter query
  const where: any = {};
  if (priorityFilter && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priorityFilter)) {
    where.priority = priorityFilter as Priority;
  }
  if (statusFilter && ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(statusFilter)) {
    where.status = statusFilter as IncidentStatus;
  }

  const incidents = await prisma.incident.findMany({
    where,
    include: {
      patient: {
        include: { user: true }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const patients = await prisma.patient.findMany({
    include: { user: true },
    orderBy: {
      user: {
        lastName: "asc"
      }
    }
  });

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
            Suivi en temps réel des incidents de santé et des alertes de sécurité des patients.
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
              href="/dashboard/incidents"
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${!statusFilter ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Tous
            </Link>
            <Link
              href={`/dashboard/incidents?status=OPEN${priorityFilter ? `&priority=${priorityFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${statusFilter === "OPEN" ? "bg-destructive text-destructive-foreground shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              À traiter
            </Link>
            <Link
              href={`/dashboard/incidents?status=IN_PROGRESS${priorityFilter ? `&priority=${priorityFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${statusFilter === "IN_PROGRESS" ? "bg-amber-500 text-white shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              En cours
            </Link>
            <Link
              href={`/dashboard/incidents?status=RESOLVED${priorityFilter ? `&priority=${priorityFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${statusFilter === "RESOLVED" ? "bg-emerald-500 text-white shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Résolus
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priorité :</span>
          <div className="flex rounded-lg border bg-background p-1 text-xs gap-1">
            <Link
              href={`/dashboard/incidents${statusFilter ? `?status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${!priorityFilter ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Toutes
            </Link>
            <Link
              href={`/dashboard/incidents?priority=LOW${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "LOW" ? "bg-secondary text-secondary-foreground shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Faible
            </Link>
            <Link
              href={`/dashboard/incidents?priority=MEDIUM${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "MEDIUM" ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Moyenne
            </Link>
            <Link
              href={`/dashboard/incidents?priority=HIGH${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "HIGH" ? "bg-orange-500 text-white shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Élevée
            </Link>
            <Link
              href={`/dashboard/incidents?priority=CRITICAL${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${priorityFilter === "CRITICAL" ? "bg-red-600 text-white shadow" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              Critique
            </Link>
          </div>
        </div>
      </div>

      {/* Table section */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[180px]">Date de signalement</TableHead>
              <TableHead className="w-[200px]">Patient</TableHead>
              <TableHead>Incident</TableHead>
              <TableHead className="w-[100px]">Priorité</TableHead>
              <TableHead className="w-[130px]">Statut</TableHead>
              <TableHead className="text-right w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-36 text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  Aucun incident trouvé avec ces critères de filtre.
                </TableCell>
              </TableRow>
            ) : (
              incidents.map((incident: Incident & { patient: Patient & { user: User } }) => (
                <TableRow key={incident.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="font-medium text-xs text-muted-foreground">
                    {formatDate(incident.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/patients/${incident.patientId}`} className="font-semibold text-primary hover:underline block">
                      {incident.patient.user.lastName} {incident.patient.user.firstName}
                    </Link>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Niveau {incident.patient.dependencyLevel}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[400px]">
                    <p className="font-semibold text-sm">{incident.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={incident.description}>
                      {incident.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {getPriorityBadge(incident.priority)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusClass(incident.status)}`}>
                      {getStatusIcon(incident.status)}
                      <span className="capitalize">{incident.status === "OPEN" ? "À traiter" : incident.status === "IN_PROGRESS" ? "En cours" : "Résolu"}</span>
                    </span>
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
