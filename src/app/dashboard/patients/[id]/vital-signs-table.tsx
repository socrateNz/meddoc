import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Relevés de constantes de la page courante (20 au plus), du plus récent au plus ancien.
// La navigation entre pages est faite par la page parente (PaginationNav).
// Relevé tel que renvoyé par getPatientVitalSigns (sous-ensemble utilisé ici).
export interface VitalSignRow {
  id: string;
  createdAt: string | Date;
  temperature: number | null;
  bloodPressure: string | null;
  heartRate: number | null;
  oxygenSaturation: number | null;
  bloodSugar: number | null;
  weight: number | null;
  painScore: number | null;
  recordedBy: { firstName: string; lastName: string } | null;
}

interface VitalSignsTableProps {
  vitalSigns: VitalSignRow[];
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default function VitalSignsTable({ vitalSigns }: VitalSignsTableProps) {
  if (vitalSigns.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Aucune constante enregistrée.</p>;
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase font-bold">Date</TableHead>
            <TableHead className="text-xs uppercase font-bold">Temp. (°C)</TableHead>
            <TableHead className="text-xs uppercase font-bold">Tension</TableHead>
            <TableHead className="text-xs uppercase font-bold">FC</TableHead>
            <TableHead className="text-xs uppercase font-bold">SpO₂ (%)</TableHead>
            <TableHead className="text-xs uppercase font-bold">Glycémie</TableHead>
            <TableHead className="text-xs uppercase font-bold">Poids (kg)</TableHead>
            <TableHead className="text-xs uppercase font-bold">Douleur</TableHead>
            <TableHead className="text-xs uppercase font-bold">Relevé par</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vitalSigns.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="text-xs whitespace-nowrap">{formatDateTime(v.createdAt)}</TableCell>
              <TableCell className="text-xs">{display(v.temperature)}</TableCell>
              <TableCell className="text-xs">{display(v.bloodPressure)}</TableCell>
              <TableCell className="text-xs">{display(v.heartRate)}</TableCell>
              <TableCell className="text-xs">{display(v.oxygenSaturation)}</TableCell>
              <TableCell className="text-xs">{display(v.bloodSugar)}</TableCell>
              <TableCell className="text-xs">{display(v.weight)}</TableCell>
              <TableCell className="text-xs">{display(v.painScore)}</TableCell>
              <TableCell className="text-xs">
                {v.recordedBy ? `${v.recordedBy.firstName} ${v.recordedBy.lastName}` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
