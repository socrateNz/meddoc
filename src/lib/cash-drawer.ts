import { PAYMENT_METHODS } from "@/lib/accounting/plan";

// Garde-fou des sorties d'argent du tiroir (dépense / retrait, achat pharmacie ou réception de
// commande payés en caisse) : on ne peut pas sortir plus d'espèces qu'il n'y en a.
//
// Solde du tiroir = même calcul que expectedAmount de la séance (src/actions/registers.ts) : fond
// d'ouverture + encaissements en espèces − sorties. Mobile Money, carte, virement et chèque ne sont
// pas dans le tiroir.
//
// À appeler DANS la transaction qui vient d'enregistrer la sortie : le solde lu inclut donc
// celle-ci, et il ne doit pas être négatif. La séance est d'abord réécrite (même valeur) : deux
// sorties simultanées sur la même caisse écrivent le même document et ne peuvent pas aboutir toutes
// les deux sur un solde lu avant l'autre (l'une échoue et est à refaire).

const NON_CASH_METHODS = PAYMENT_METHODS.filter((m) => m !== "CASH");

type Client = {
  cashSession: { findUnique: (args: any) => Promise<any>; update: (args: any) => Promise<any> };
  financialTransaction: { aggregate: (args: any) => Promise<any> };
};

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} FCFA`;

export async function drawerCashBalance(client: Client, cashSessionId: string): Promise<number> {
  const session = await client.cashSession.findUnique({ where: { id: cashSessionId }, select: { openingFloat: true } });
  if (!session) throw new Error("Session de caisse introuvable.");
  const filter = { cashSessionId };
  const [income, nonCashIncome, expense] = await Promise.all([
    client.financialTransaction.aggregate({ where: { ...filter, type: "INCOME" }, _sum: { amount: true } }),
    client.financialTransaction.aggregate({ where: { ...filter, type: "INCOME", paymentMethod: { in: NON_CASH_METHODS } }, _sum: { amount: true } }),
    client.financialTransaction.aggregate({ where: { ...filter, type: "EXPENSE" }, _sum: { amount: true } }),
  ]);
  return (session.openingFloat ?? 0) + (income._sum.amount ?? 0) - (nonCashIncome._sum.amount ?? 0) - (expense._sum.amount ?? 0);
}

// amount : montant de la sortie qui vient d'être enregistrée dans la transaction (pour le message).
export async function assertDrawerNotOverdrawn(client: Client, cashSessionId: string, amount: number) {
  const session = await client.cashSession.findUnique({ where: { id: cashSessionId }, select: { openingFloat: true } });
  if (!session) throw new Error("Session de caisse introuvable.");
  await client.cashSession.update({ where: { id: cashSessionId }, data: { openingFloat: session.openingFloat } });
  const after = await drawerCashBalance(client, cashSessionId);
  // Tolérance d'arrondi (montants en Float).
  if (after < -0.005) {
    const available = Math.max(0, after + amount);
    throw new Error(`Fonds insuffisants en caisse : ${fcfa(available)} disponibles, sortie demandée de ${fcfa(amount)}.`);
  }
}
