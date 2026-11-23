import { can, type PermissionSubject } from "./permissions-catalog";

// Réductions sur les factures (tickets de caisse) : une réduction se pose LIGNE PAR LIGNE
// (l'examen d'un patient, sa consultation, un médicament...), en FCFA, avec un motif.
//
// Une ligne réduite garde son prix (quantity × unitPrice) et porte `discount` ; son `amount` est le
// montant NET (prix − réduction). Tout ce qui totalise un ticket (reste à payer, caisse, finance,
// comptabilité) lit `amount` : la réduction y est donc partout prise en compte, sans cas
// particulier. Comptablement, une réduction accordée sur la facture se déduit de la vente (le
// produit est comptabilisé net).
//
// Accorder une réduction : permission « invoices.discount » (par défaut le coordinateur). Le
// caissier encaisse un ticket déjà réduit sans pouvoir créer ni augmenter de réduction.

export type DiscountableItem = {
  type?: string;
  pharmacyItemId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount?: number;
  discountReason?: string;
  // Qui a accordé la réduction, et quand (ISO) — récapitulatif « Réductions accordées ».
  discountById?: string;
  discountAt?: string;
  [key: string]: unknown;
};

export type DiscountAuthor = { id: string; at?: Date };

const round = (n: number) => Math.round(Number(n) || 0);

export function grossAmount(item: Pick<DiscountableItem, "quantity" | "unitPrice">): number {
  return round(Number(item.quantity) * Number(item.unitPrice));
}

export function itemDiscount(item: Pick<DiscountableItem, "discount">): number {
  return Math.max(0, round(Number(item.discount) || 0));
}

export function totalDiscount(items: readonly Pick<DiscountableItem, "discount">[]): number {
  return items.reduce((sum, item) => sum + itemDiscount(item), 0);
}

// Applique la réduction d'une ligne : montant net recalculé depuis le prix, réduction bornée au
// prix, champs retirés quand il n'y a plus de réduction. Une ligne sans réduction est rendue telle
// quelle (son montant n'est pas recalculé : lignes historiques dont le montant ne suit pas toujours
// quantité × prix).
export function withDiscount<T extends DiscountableItem>(item: T, discount: number, reason?: string, author?: DiscountAuthor): T {
  const d = Math.max(0, round(discount));
  const { discount: _d, discountReason: _r, discountById: _b, discountAt: _a, ...rest } = item;
  void _d;
  void _r;
  void _b;
  void _a;
  if (d <= 0) {
    const hadDiscount = itemDiscount(item) > 0;
    return (hadDiscount ? { ...rest, amount: grossAmount(item) } : rest) as T;
  }
  const gross = grossAmount(item);
  if (d > gross) throw new Error(`La réduction sur « ${item.description} » dépasse son prix (${gross} FCFA).`);
  const motive = (reason ?? "").trim();
  if (!motive) throw new Error(`Indiquez le motif de la réduction sur « ${item.description} ».`);
  const who = author ? { discountById: author.id, discountAt: (author.at ?? new Date()).toISOString() } : { discountById: item.discountById, discountAt: item.discountAt };
  return {
    ...rest,
    discount: d,
    discountReason: motive.slice(0, 200),
    ...(who.discountById ? { discountById: who.discountById } : {}),
    ...(who.discountAt ? { discountAt: who.discountAt } : {}),
    amount: gross - d,
  } as T;
}

// Normalise les lignes reçues du navigateur (montant net recalculé côté serveur, jamais celui
// transmis) et vérifie le droit d'accorder les réductions NOUVELLES ou AUGMENTÉES par rapport aux
// lignes déjà enregistrées sur le ticket (`previous`) : un caissier peut encaisser un ticket réduit
// par le coordinateur, pas en créer.
export function applyItemDiscounts<T extends DiscountableItem>(
  user: PermissionSubject & ({ id?: string } | string | null | undefined),
  items: T[],
  previous: readonly DiscountableItem[] = []
): T[] {
  const keyOf = (it: DiscountableItem) => `${it.pharmacyItemId ?? ""}|${it.description}`;
  const previousDiscount = new Map<string, number>();
  const previousItem = new Map<string, DiscountableItem>();
  for (const it of previous) {
    const key = keyOf(it);
    if (itemDiscount(it) >= (previousDiscount.get(key) ?? 0)) previousItem.set(key, it);
    previousDiscount.set(key, Math.max(previousDiscount.get(key) ?? 0, itemDiscount(it)));
  }
  const userId = user && typeof user === "object" && "id" in user ? user.id : undefined;
  const allowed = can(user, "invoices.discount");
  return items.map((item) => {
    const d = itemDiscount(item);
    if (d > 0 && !allowed && d > (previousDiscount.get(keyOf(item)) ?? 0)) {
      throw new Error("Non autorisé. Seul un responsable (coordinateur) peut accorder une réduction.");
    }
    if (d <= 0) return withDiscount(item, 0);
    // Réduction déjà enregistrée et inchangée : son auteur d'origine ; sinon, l'utilisateur.
    const prior = previousItem.get(keyOf(item));
    if (prior && itemDiscount(prior) === d) {
      return withDiscount({ ...item, discountById: prior.discountById, discountAt: prior.discountAt }, d, item.discountReason ?? prior.discountReason);
    }
    return withDiscount({ ...item, discountById: undefined, discountAt: undefined }, d, item.discountReason, userId ? { id: userId } : undefined);
  });
}

// Réduction sur TOUT le ticket : répartie sur les lignes au prorata de leur prix (au franc près,
// plus forts restes), chaque ligne restant bornée à son prix — la comptabilité garde ainsi la
// remise de chaque nature (7019 pharmacie, 7069 prestations).
export function spreadDiscount(grossByLine: readonly number[], total: number): number[] {
  const gross = grossByLine.map((g) => Math.max(0, round(g)));
  const sum = gross.reduce((s, g) => s + g, 0);
  const target = Math.min(sum, Math.max(0, round(total)));
  if (sum <= 0 || target <= 0) return gross.map(() => 0);
  const exact = gross.map((g) => (g * target) / sum);
  const parts = exact.map((e) => Math.floor(e));
  let rest = target - parts.reduce((s, p) => s + p, 0);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    if (parts[i] < gross[i]) {
      parts[i]++;
      rest--;
    }
  }
  return parts;
}
