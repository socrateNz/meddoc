import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileSignature } from "lucide-react";
import ContractRowActions from "./contract-row-actions";

interface ContractRow {
  id: string;
  title: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  hourlyRate: number;
  hoursPerWeek: number;
  patient: { user: { firstName: string; lastName: string } };
  caregiver: { user: { firstName: string; lastName: string } } | null;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

function statusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20" variant="outline">Actif</Badge>;
    case "SUSPENDED":
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20" variant="outline">Suspendu</Badge>;
    case "COMPLETED":
      return <Badge variant="secondary">Terminé</Badge>;
    case "TERMINATED":
      return <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20" variant="outline">Résilié</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function ContractsList({ contracts }: { contracts: ContractRow[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Patient</TableHead>
            <TableHead>Aidant / Soignant</TableHead>
            <TableHead>Objet</TableHead>
            <TableHead>Période</TableHead>
            <TableHead>Conditions</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-36 text-center text-muted-foreground">
                <FileSignature className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                Aucun contrat enregistré pour le moment.
              </TableCell>
            </TableRow>
          ) : (
            contracts.map((contract) => (
              <TableRow key={contract.id} className="hover:bg-muted/20 transition-colors">
                <TableCell className="font-semibold text-sm">
                  {contract.patient.user.lastName} {contract.patient.user.firstName}
                </TableCell>
                <TableCell className="text-sm">
                  {contract.caregiver
                    ? `${contract.caregiver.user.lastName} ${contract.caregiver.user.firstName}`
                    : <span className="text-amber-600 text-xs font-medium">Non assigné</span>}
                </TableCell>
                <TableCell className="text-sm max-w-[240px]">{contract.title}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(contract.startDate)} {contract.endDate ? `→ ${formatDate(contract.endDate)}` : "→ en cours"}
                </TableCell>
                <TableCell className="text-xs">
                  {new Intl.NumberFormat("fr-FR").format(contract.hourlyRate)} FCFA/h · {contract.hoursPerWeek}h/sem.
                </TableCell>
                <TableCell>{statusBadge(contract.status)}</TableCell>
                <TableCell className="text-right">
                  <ContractRowActions contractId={contract.id} currentStatus={contract.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
