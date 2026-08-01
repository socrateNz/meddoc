import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: Date;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function AuditLogTable({ logs }: { logs: AuditLogRow[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-[160px]">Date</TableHead>
            <TableHead className="w-[220px]">Utilisateur</TableHead>
            <TableHead className="w-[200px]">Action</TableHead>
            <TableHead>Entité concernée</TableHead>
            <TableHead>Détails</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-36 text-center text-muted-foreground">
                <ScrollText className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                Aucune entrée dans le journal d'audit pour le moment.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id} className="hover:bg-muted/20 transition-colors align-top">
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(log.createdAt)}
                </TableCell>
                <TableCell>
                  <p className="font-semibold text-sm">
                    {log.user.lastName} {log.user.firstName}
                  </p>
                  <p className="text-xs text-muted-foreground">{log.user.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {log.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-medium">{log.entityType}</span>
                  <span className="text-muted-foreground"> · {log.entityId}</span>
                </TableCell>
                <TableCell className="max-w-[320px] text-xs text-muted-foreground break-words">
                  {log.details || "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
