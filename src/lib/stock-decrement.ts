import { applyLotConsumption, decrementField, groupIdsByValue, planLotConsumption } from "@/lib/stock-batch";

// Partagé par la caisse/pharmacie (src/actions/finance.ts) et le laboratoire (consommables des
// examens facturés à un partenaire, cf. src/actions/lab.ts).
// Décrémente le stock (agrégé + lots FEFO) de tous les produits d'un ticket avec un nombre de
// requêtes proche de constant plutôt que proportionnel au nombre de lignes : 2 lectures groupées
// (produits, lots), puis des écritures groupées par valeur identique. L'ancienne version enchaînait
// lecture produit + mise à jour + lecture des lots + une mise à jour par lot, ligne après ligne
// (~5 requêtes séquentielles par ligne) — un ticket de 12 lignes dépassait les 20s de timeout de
// transaction à ~330ms l'aller-retour vers la base depuis Vercel. Les quantités d'un même produit
// présent sur plusieurs lignes sont additionnées avant la vérification de stock (l'ancienne
// version validait chaque ligne isolément et pouvait laisser passer un total supérieur au stock).
export async function decrementStockForItems(
  tx: any,
  items: Array<{ type: "PHARMACY" | "SERVICE" | "LAB"; pharmacyItemId?: string; description: string; quantity: number }>,
  organizationId: string | null
) {
  const wanted = new Map<string, { quantity: number; description: string }>();
  for (const item of items) {
    if (item.type !== "PHARMACY" || !item.pharmacyItemId) continue;
    const quantity = Number(item.quantity);
    const existing = wanted.get(item.pharmacyItemId);
    if (existing) existing.quantity += quantity;
    else wanted.set(item.pharmacyItemId, { quantity, description: item.description });
  }
  if (wanted.size === 0) return [];

  const itemIds = Array.from(wanted.keys());
  const pharmacyItems: any[] = await tx.pharmacyItem.findMany({ where: { id: { in: itemIds } } });
  const pharmacyItemById = new Map(pharmacyItems.map((p) => [p.id, p]));

  const stockSnapshots = new Map<string, { name: string; stockQuantity: number; reorderLevel: number }>();
  for (const [pharmacyItemId, { quantity, description }] of wanted) {
    const pItem = pharmacyItemById.get(pharmacyItemId);
    if (!pItem) throw new Error(`Produit introuvable : ${description}`);
    if (pItem.stockQuantity < quantity) {
      throw new Error(`Stock insuffisant pour "${pItem.name}". Disponible: ${pItem.stockQuantity}, Demandé: ${quantity}`);
    }
    stockSnapshots.set(pharmacyItemId, { name: pItem.name, stockQuantity: pItem.stockQuantity, reorderLevel: pItem.reorderLevel });
  }

  // Consommation FEFO calculée en mémoire (cf. planLotConsumption).
  const lots: any[] = await tx.stockPurchase.findMany({
    where: { pharmacyItemId: { in: itemIds }, remainingQuantity: { gt: 0 } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
  });
  await applyLotConsumption(tx, planLotConsumption(lots, new Map(Array.from(wanted, ([id, v]) => [id, v.quantity]))));
  for (const [quantity, ids] of groupIdsByValue(Array.from(wanted, ([id, v]) => [id, v.quantity] as [string, number]))) {
    await decrementField(tx.pharmacyItem, ids, "stockQuantity", quantity);
  }

  const lowStockAlerts: any[] = [];
  for (const [pharmacyItemId, snapshot] of stockSnapshots) {
    const soldQty = wanted.get(pharmacyItemId)!.quantity;
    const newQty = snapshot.stockQuantity - soldQty;
    if (snapshot.stockQuantity > snapshot.reorderLevel && newQty <= snapshot.reorderLevel) {
      lowStockAlerts.push({
        pharmacyItemId,
        itemName: snapshot.name,
        stockQuantity: newQty,
        reorderLevel: snapshot.reorderLevel,
        organizationId,
      });
    }
  }
  return lowStockAlerts;
}
