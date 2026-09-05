import { Badge } from "@/components/ui/badge";

function formatFCFA(val: number) {
  const num = Math.round(Number(val) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

interface PaymentStatusBadgeProps {
  status: string; // PENDING | PARTIAL | PAID
  // Si omis (ex: journal Finance, où le calculer coûterait une requête par ligne), la mention
  // "reste à payer" est simplement omise du badge PARTIAL.
  amountPaid?: number;
  totalAmount?: number;
  className?: string;
}

// Mention visible sur un ticket dont le règlement n'est pas (encore) complet — paiement
// échelonné / vente à crédit. Utilisé sur la file d'attente pharmacie, le journal Finance et
// l'onglet "Tickets impayés" de la caisse, partout où PendingInvoice.status seul ne suffit plus
// à savoir si une vente a été soldée le jour même.
export default function PaymentStatusBadge({ status, amountPaid, totalAmount, className = "" }: PaymentStatusBadgeProps) {
  if (status === "PARTIAL") {
    const knowsRemaining = amountPaid != null && totalAmount != null;
    const remaining = knowsRemaining ? Math.max(0, totalAmount! - amountPaid!) : null;
    return (
      <Badge variant="outline" className={`text-[10px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 ${className}`}>
        {remaining != null ? `Partiel — reste ${formatFCFA(remaining)}` : "Partiel"}
      </Badge>
    );
  }
  if (status === "PENDING") {
    return (
      <Badge variant="outline" className={`text-[10px] shrink-0 bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 ${className}`}>
        Non payé — vente à crédit
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`text-[10px] shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 ${className}`}>
      Payé
    </Badge>
  );
}
