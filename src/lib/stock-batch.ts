// Aides d'écriture GROUPÉE sur le stock, pour tenir dans le temps imparti sur Vercel : chaque
// requête vers Atlas coûte ~330ms d'aller-retour depuis la fonction, donc une boucle "une requête
// par produit" sur un catalogue de plusieurs centaines de lignes (276 constatés en production)
// dépasse la durée maximale de la fonction (FUNCTION_INVOCATION_TIMEOUT) bien avant d'avoir fini.
// Principe : lire en bloc, calculer en mémoire, écrire en groupes de valeur identique.
//
// Module volontairement SANS directive "use server" (cf. pharmacy-sale-block.ts) : dans un fichier
// de ce type, toute fonction exportée deviendrait une action appelable depuis le navigateur.

// Regroupe des ids par valeur identique pour les écrire d'un seul updateMany plutôt que d'un
// update par id (ex: dix produits remis chacun en quantité 6 = une seule écriture).
export function groupIdsByValue(entries: Array<[string, number]>): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const [id, value] of entries) {
    const ids = groups.get(value);
    if (ids) ids.push(id);
    else groups.set(value, [id]);
  }
  return groups;
}

export async function decrementField(model: any, ids: string[], field: string, amount: number) {
  if (ids.length === 1) {
    await model.update({ where: { id: ids[0] }, data: { [field]: { decrement: amount } } });
  } else {
    await model.updateMany({ where: { id: { in: ids } }, data: { [field]: { decrement: amount } } });
  }
}

export async function setField(model: any, ids: string[], field: string, value: number) {
  if (ids.length === 1) {
    await model.update({ where: { id: ids[0] }, data: { [field]: value } });
  } else {
    await model.updateMany({ where: { id: { in: ids } }, data: { [field]: value } });
  }
}

export interface LotConsumptionPlan {
  fullyConsumedLotIds: string[];
  partialTakes: Array<[string, number]>;
  // Valeur consommée par produit, aux prix d'achat réels des lots puisés.
  costByItem: Map<string, number>;
}

// Consommation FEFO calculée EN MÉMOIRE (même logique que consumeStockLots) : `lots` doit déjà être
// trié péremption la plus proche d'abord, puis achat le plus ancien. Si les lots ne couvrent pas
// toute la quantité demandée (stock hérité d'avant le suivi par lot), la part non couverte n'est
// simplement pas valorisée par lot — on ne bloque pas l'opération, comme consumeStockLots.
export function planLotConsumption(lots: any[], wanted: Map<string, number>): LotConsumptionPlan {
  const lotsByItem = new Map<string, any[]>();
  for (const lot of lots) {
    const list = lotsByItem.get(lot.pharmacyItemId);
    if (list) list.push(lot);
    else lotsByItem.set(lot.pharmacyItemId, [lot]);
  }

  const plan: LotConsumptionPlan = { fullyConsumedLotIds: [], partialTakes: [], costByItem: new Map() };
  for (const [pharmacyItemId, quantity] of wanted) {
    let remaining = quantity;
    let cost = 0;
    for (const lot of lotsByItem.get(pharmacyItemId) || []) {
      if (remaining <= 0) break;
      const take = Math.min(lot.remainingQuantity, remaining);
      if (take === lot.remainingQuantity) plan.fullyConsumedLotIds.push(lot.id);
      else plan.partialTakes.push([lot.id, take]);
      cost += take * lot.purchasePrice;
      remaining -= take;
    }
    plan.costByItem.set(pharmacyItemId, cost);
  }
  return plan;
}

// Écrit le plan : un seul updateMany pour tous les lots vidés, puis un par quantité partielle
// distincte (au plus un lot partiellement entamé par produit).
export async function applyLotConsumption(tx: any, plan: LotConsumptionPlan) {
  if (plan.fullyConsumedLotIds.length > 0) {
    await tx.stockPurchase.updateMany({ where: { id: { in: plan.fullyConsumedLotIds } }, data: { remainingQuantity: 0 } });
  }
  for (const [take, lotIds] of groupIdsByValue(plan.partialTakes)) {
    await decrementField(tx.stockPurchase, lotIds, "remainingQuantity", take);
  }
}
