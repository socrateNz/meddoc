import { prisma } from "@/lib/db";
import { formatIpp } from "@/lib/patient-identity";

// Incrémente atomiquement le compteur `key` (créé à 1 s'il n'existe pas) et renvoie sa nouvelle
// valeur. findAndModify est atomique côté MongoDB : deux appels concurrents obtiennent toujours
// deux valeurs distinctes — contrairement à un upsert Prisma, qui peut tenter deux créations
// simultanées du même compteur.
export async function nextSequenceValue(key: string): Promise<number> {
  const res = (await prisma.$runCommandRaw({
    findAndModify: "Counter",
    query: { key },
    update: { $inc: { value: 1 } },
    upsert: true,
    new: true,
  })) as { value?: { value?: number } };
  const value = Number(res?.value?.value);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Impossible d'attribuer un numéro de dossier (IPP).");
  }
  return value;
}

// Prochain IPP pour l'année de `date` (année civile UTC). Attribué AVANT la transaction de
// création du patient, pour ne pas faire de ce compteur partagé un point de contention : si la
// création échoue ensuite, le numéro est simplement perdu (trou dans la séquence, sans risque de
// doublon).
export async function nextIpp(date: Date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const sequence = await nextSequenceValue(`ipp-${year}`);
  return formatIpp(year, sequence);
}
