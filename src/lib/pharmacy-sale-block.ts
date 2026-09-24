import { prisma } from "@/lib/db";

// Contrôles du blocage d'un produit posé par le coordinateur (cf. setPharmacyItemSaleBlock). Un
// produit bloqué ne peut plus ni être vendu à la caisse, ni être acheté, commandé ou réceptionné :
// bloquer un produit (rappel de lot, périmé, retrait commercial) n'aurait aucun sens si on pouvait
// continuer à en faire entrer du nouveau stock. Le blocage ne vaut que pour ces entrées/sorties
// commerciales — jamais pour un retour de stock légitime (annulation de remise, surplus
// d'inventaire), qui ne passent pas par ici.
//
// Module volontairement SANS directive "use server" : dans un fichier de ce type, toute fonction
// exportée devient une action appelable depuis le navigateur. Ces contrôles ne sont faits que pour
// être appelés par d'autres actions serveur.

interface BlockableItem {
  name: string;
  dosage?: string | null;
  saleBlockedAt?: unknown;
  saleBlockedReason?: string | null;
}

function describe(item: BlockableItem) {
  return `« ${item.name}${item.dosage ? ` (${item.dosage})` : ""} » — ${item.saleBlockedReason || "aucun motif renseigné"}`;
}

// Refuse un ticket de caisse contenant un produit bloqué (cf. createCaisseSale, payPendingInvoice).
// Vérifié côté serveur : l'interface de caisse grise déjà ces produits, mais seul ce contrôle est
// opposable à un appel direct de l'action.
export async function assertPharmacyItemsSellable(items: Array<{ type: string; pharmacyItemId?: string }>) {
  const ids = Array.from(
    new Set(items.filter((i) => i.type === "PHARMACY" && i.pharmacyItemId).map((i) => i.pharmacyItemId as string))
  );
  if (ids.length === 0) return;

  const found = await prisma.pharmacyItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, dosage: true, saleBlockedAt: true, saleBlockedReason: true },
  });
  const blocked = found.filter((p) => p.saleBlockedAt);
  if (blocked.length === 0) return;

  throw new Error(`Vente bloquée par le coordinateur : ${blocked.map(describe).join(" ; ")}. Retirez ce produit du panier.`);
}

// Refuse un achat ou une réception pour un produit DÉJÀ chargé (on n'a alors pas besoin d'une
// requête de plus : recordStockPurchase et receivePurchaseOrderLines lisent déjà le produit).
export function assertItemPurchasable(item: BlockableItem | null | undefined) {
  if (item?.saleBlockedAt) {
    throw new Error(
      `Achat impossible : ${describe(item)}. Ce produit est bloqué par le coordinateur, qui doit d'abord le débloquer.`
    );
  }
}

// Même refus pour des produits pas encore chargés (création d'une commande fournisseur : commander
// un produit bloqué est refusé dès le départ, pas seulement à la réception).
export async function assertPharmacyItemsPurchasable(pharmacyItemIds: string[]) {
  const ids = Array.from(new Set(pharmacyItemIds.filter(Boolean)));
  if (ids.length === 0) return;

  const found = await prisma.pharmacyItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, dosage: true, saleBlockedAt: true, saleBlockedReason: true },
  });
  const blocked = found.filter((p) => p.saleBlockedAt);
  if (blocked.length === 0) return;

  throw new Error(
    `Commande impossible : ${blocked.map(describe).join(" ; ")}. Ce produit est bloqué par le coordinateur, qui doit d'abord le débloquer.`
  );
}
