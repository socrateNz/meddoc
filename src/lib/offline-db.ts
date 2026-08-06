"use client";

// Base RxDB côté client (IndexedDB via Dexie) — chargée uniquement à l'appel de
// `getOfflineDb()`, jamais importée statiquement depuis un composant serveur. Les
// composants doivent utiliser `await import("@/lib/offline-db")` dans un effet/handler
// pour garantir que ce module (et RxDB) n'est jamais évalué pendant le rendu SSR.

import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { replicateRxCollection } from "rxdb/plugins/replication";
import { encryptField } from "@/lib/offline-crypto";

// Document tel que stocké localement : les champs sensibles sont déjà chiffrés
// (cf. src/lib/offline-crypto.ts) — jamais de texte en clair dans IndexedDB.
export interface OfflinePatientDoc {
  id: string;
  firstNameEnc: string;
  lastNameEnc: string;
  emailEnc: string;
  addressEnc: string;
  allergiesEnc: string;
  pathologiesEnc: string;
  dateOfBirthEnc: string;
  organizationId: string | null;
  status: string;
  dependencyLevel: number;
  updatedAt: string;
  _deleted?: boolean;
}

type OfflineCollections = { patients: RxCollection<OfflinePatientDoc> };
type OfflineDatabase = RxDatabase<OfflineCollections>;

const patientSchema = {
  title: "patient",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    firstNameEnc: { type: "string" },
    lastNameEnc: { type: "string" },
    emailEnc: { type: "string" },
    addressEnc: { type: "string" },
    allergiesEnc: { type: "string" },
    pathologiesEnc: { type: "string" },
    dateOfBirthEnc: { type: "string" },
    organizationId: { type: ["string", "null"] },
    status: { type: "string" },
    dependencyLevel: { type: "number" },
    updatedAt: { type: "string" },
    _deleted: { type: "boolean" },
  },
  required: ["id", "updatedAt"],
  indexes: ["updatedAt"],
} as const;

let dbPromise: Promise<OfflineDatabase> | null = null;
let currentOrgId: string | null = null;

// Une base par organisation (nom dérivé de organizationId) : isolation multi-tenant locale,
// pour qu'un changement de compte/organisation sur le même appareil ne mélange jamais les
// données de deux établissements dans le même storage Dexie.
export async function getOfflineDb(organizationId: string): Promise<OfflineDatabase> {
  if (dbPromise && currentOrgId === organizationId) return dbPromise;

  currentOrgId = organizationId;
  dbPromise = (async () => {
    if (process.env.NODE_ENV !== "production") {
      const { RxDBDevModePlugin } = await import("rxdb/plugins/dev-mode");
      addRxPlugin(RxDBDevModePlugin);
    }

    const db = await createRxDatabase<OfflineCollections>({
      name: `meddoc-offline-${organizationId}`,
      storage: getRxStorageDexie(),
      ignoreDuplicate: process.env.NODE_ENV !== "production",
    });

    await db.addCollections({
      patients: { schema: patientSchema },
    });

    return db;
  })();

  return dbPromise;
}

interface PullCheckpoint {
  updatedAt: string;
  id: string;
}

// Réplication pull-only (Phase 1 — Patient reste en lecture seule hors-ligne, aucune écriture
// locale n'est jamais poussée). Le chiffrement des champs sensibles se fait ici, dans
// `pull.modifier`, juste avant que RxDB persiste le document — le serveur ne renvoie que du
// clair (protégé en transit par TLS uniquement), la clé de chiffrement local ne le quitte jamais.
export function startPatientsReplication(db: OfflineDatabase) {
  return replicateRxCollection<OfflinePatientDoc, PullCheckpoint>({
    collection: db.patients,
    replicationIdentifier: "patients-pull-v1",
    live: true,
    retryTime: 10000,
    autoStart: true,
    pull: {
      batchSize: 100,
      handler: async (checkpoint, batchSize) => {
        const params = new URLSearchParams({ limit: String(batchSize) });
        if (checkpoint) {
          params.set("updatedAt", checkpoint.updatedAt);
          params.set("id", checkpoint.id);
        }
        const res = await fetch(`/api/sync/patients?${params.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error("Erreur lors de la synchronisation des patients.");
        const body: { documents: any[]; checkpoint: PullCheckpoint | null } = await res.json();
        return { documents: body.documents, checkpoint: body.checkpoint ?? undefined };
      },
      modifier: async (doc: any) => ({
        id: doc.id,
        firstNameEnc: await encryptField(doc.firstName),
        lastNameEnc: await encryptField(doc.lastName),
        emailEnc: await encryptField(doc.email),
        addressEnc: await encryptField(doc.address),
        allergiesEnc: await encryptField(JSON.stringify(doc.allergies)),
        pathologiesEnc: await encryptField(JSON.stringify(doc.pathologies)),
        dateOfBirthEnc: await encryptField(doc.dateOfBirth),
        organizationId: doc.organizationId,
        status: doc.status,
        dependencyLevel: doc.dependencyLevel,
        updatedAt: doc.updatedAt,
        _deleted: Boolean(doc._deleted),
      }),
    },
  });
}
