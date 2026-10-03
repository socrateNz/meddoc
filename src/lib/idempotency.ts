// Protection serveur contre la double création. Le client génère une clé unique par soumission
// (cf. src/hooks/use-submit-guard.ts) et la renvoie à chaque tentative, y compris lors du rejeu
// d'une file hors-ligne. Ici, la première exécution réussie est mémorisée avec son résultat : toute
// nouvelle requête portant la même clé reçoit ce résultat sans rien recréer.
//
// Choix délibérés :
// - la clé est scopée à l'utilisateur et à l'action : deux personnes ou deux actions ne peuvent
//   jamais se "voler" une clé ;
// - un empreinte des arguments est stockée : réutiliser une clé avec d'autres valeurs est refusé
//   plutôt que de renvoyer silencieusement le résultat de l'ancienne saisie ;
// - un échec métier supprime l'entrée : une nouvelle tentative (après correction, ou après une
//   coupure réseau) doit pouvoir s'exécuter réellement ;
// - une entrée encore en cours (PENDING) bloque la requête parallèle au lieu de la laisser passer.

import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

type ActionResult = { success: boolean; error?: string };

function fingerprint(args: unknown): string {
  return createHash("sha256").update(JSON.stringify(args) ?? "").digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

// Le type T est celui de l'action appelante : un échec ici a exactement la même forme que ceux
// qu'elle renvoie elle-même, d'où le cast.
function failure<T extends ActionResult>(error: string): T {
  return { success: false, error } as unknown as T;
}

export async function runIdempotent<T extends ActionResult>(
  action: string,
  idempotencyKey: string | undefined,
  args: unknown,
  run: () => Promise<T>
): Promise<T> {
  // Sans clé (anciens appelants, tests) : exécution directe, comportement inchangé.
  if (idempotencyKey === undefined) return run();

  if (idempotencyKey.length === 0 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return failure<T>("Clé de requête invalide.");
  }

  const user = await getCurrentUser();
  // Sans session, l'action elle-même refusera l'appel avec son propre message d'authentification.
  if (!user) return run();

  const hash = fingerprint(args);
  const scope = { userId_action_key: { userId: user.id, action, key: idempotencyKey } };

  const existing = await prisma.idempotencyRecord.findUnique({ where: scope });
  if (existing) return replay<T>(existing, hash);

  try {
    await prisma.idempotencyRecord.create({
      data: { userId: user.id, action, key: idempotencyKey, requestHash: hash, status: "PENDING" },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Une requête identique vient d'être réservée entre-temps (double clic très rapproché).
    const concurrent = await prisma.idempotencyRecord.findUnique({ where: scope });
    if (concurrent) return replay<T>(concurrent, hash);
    throw error;
  }

  let result: T;
  try {
    result = await run();
  } catch (error) {
    await prisma.idempotencyRecord.delete({ where: scope }).catch(() => undefined);
    throw error;
  }

  if (result.success) {
    const stored = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
    await prisma.idempotencyRecord.update({
      where: scope,
      data: { status: "DONE", result: stored },
    });
  } else {
    await prisma.idempotencyRecord.delete({ where: scope }).catch(() => undefined);
  }

  return result;
}

function replay<T extends ActionResult>(
  record: { requestHash: string; status: string; result: Prisma.JsonValue | null },
  hash: string
): T {
  if (record.requestHash !== hash) {
    return failure("Cette demande a déjà été envoyée avec d'autres valeurs. Rechargez la page avant de recommencer.");
  }
  if (record.status === "DONE" && record.result && typeof record.result === "object") {
    return record.result as T;
  }
  return failure("Cette demande est déjà en cours de traitement.");
}

// Ajouté au paramètre objet des créations : la clé voyage avec les données, mais n'est jamais
// transmise à la logique métier (cf. enveloppes générées dans les actions).
export type IdempotentInput = { idempotencyKey?: string };
