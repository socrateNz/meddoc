import { BadgePercent } from "lucide-react";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

type Line = {
  invoiceId: string;
  ticketRef: string;
  at: string;
  patientName: string | null;
  description: string;
  gross: number;
  discount: number;
  reason: string | null;
  grantedByName: string | null;
};

const SHOWN = 50;

// Réductions accordées sur la période de la page (cf. listInvoiceDiscounts). En comptabilité, elles
// sont aux comptes 7019 (pharmacie) et 7069 (prestations).
export default function DiscountsCard({ data, periodLabel }: { data: { total: number; count: number; lines: Line[] }; periodLabel?: string }) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BadgePercent className="h-5 w-5 text-violet-600" />
            Réductions accordées
          </h2>
          <p className="text-xs text-muted-foreground">
            {periodLabel ? `${periodLabel} · ` : ""}En comptabilité : comptes 7019 (pharmacie) et 7069 (consultations, actes, hospitalisation).
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-violet-700 dark:text-violet-300">{formatFCFA(data.total)}</p>
          <p className="text-xs text-muted-foreground">
            {data.count} réduction{data.count > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {data.count === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune réduction sur la période.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Patient</th>
                <th className="px-3 py-2">Prestation</th>
                <th className="px-3 py-2 text-right">Prix</th>
                <th className="px-3 py-2 text-right">Réduction</th>
                <th className="px-3 py-2">Motif</th>
                <th className="px-3 py-2">Accordée par</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.slice(0, SHOWN).map((l, i) => (
                <tr key={`${l.invoiceId}-${i}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(l.at).toLocaleDateString("fr-FR")}
                    <span className="block font-mono">{l.ticketRef}</span>
                  </td>
                  <td className="px-3 py-2">{l.patientName || "Client comptant"}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatFCFA(l.gross)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-violet-700 dark:text-violet-300">−{formatFCFA(l.discount)}</td>
                  <td className="px-3 py-2 text-xs">{l.reason || "—"}</td>
                  <td className="px-3 py-2 text-xs">{l.grantedByName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.count > SHOWN && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              … et {data.count - SHOWN} autre{data.count - SHOWN > 1 ? "s" : ""} (réduisez la période pour les voir).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
