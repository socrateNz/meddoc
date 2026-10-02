"use client";

// Base RxDB côté client (IndexedDB via Dexie) — chargée uniquement à l'appel de
// `getOfflineDb()`, jamais importée statiquement depuis un composant serveur. Les
// composants doivent utiliser `await import("@/lib/offline-db")` dans un effet/handler
// pour garantir que ce module (et RxDB) n'est jamais évalué pendant le rendu SSR.

import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection, type WithDeleted } from "rxdb";
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

// Catalogue des examens de laboratoire — réplique en LECTURE SEULE, jamais chiffrée (ce ne sont
// que des libellés/tarifs, pas des données personnelles) : permet au dialogue "Nouvelle demande
// d'analyse" de fonctionner hors-ligne (cf. new-lab-order-dialog.tsx). Le tarif répliqué est
// basePrice (hors consommables, dont le coût dépend du stock pharmacie au moment réel de la
// commande) — un estimatif suffisant pour composer la demande ; le prix définitif se fige côté
// serveur à la synchronisation, comme pour une commande en ligne normale.
export interface OfflineLabTestDoc {
  id: string;
  name: string;
  department: string | null;
  basePrice: number;
  organizationId: string | null;
  updatedAt: string;
  _deleted?: boolean;
}

// Catalogue pharmacie — réplique en lecture seule, jamais chiffrée, pour que le panier de caisse
// (produit, prix, stock) reste composable hors-ligne (cf. caisse-cart-dialog.tsx). stockQuantity
// n'est qu'un dernier instantané connu : une vente hors-ligne peut être refusée à la
// synchronisation si le stock réel a changé entretemps (cf. src/lib/offlineSync.ts, conflit
// affiché par OfflineBanner plutôt que silencieusement résolu).
export interface OfflinePharmacyItemDoc {
  id: string;
  name: string;
  dosage: string | null;
  unitPrice: number;
  stockQuantity: number;
  saleBlockedAt: string | null;
  saleBlockedReason: string | null;
  organizationId: string | null;
  updatedAt: string;
  _deleted?: boolean;
}

type OfflineCollections = {
  patients: RxCollection<OfflinePatientDoc>;
  labTests: RxCollection<OfflineLabTestDoc>;
  pharmacyItems: RxCollection<OfflinePharmacyItemDoc>;
};
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

const labTestSchema = {
  title: "labTest",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    name: { type: "string" },
    department: { type: ["string", "null"] },
    basePrice: { type: "number" },
    organizationId: { type: ["string", "null"] },
    updatedAt: { type: "string" },
    _deleted: { type: "boolean" },
  },
  required: ["id", "updatedAt"],
  indexes: ["updatedAt"],
} as const;

const pharmacyItemSchema = {
  title: "pharmacyItem",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    name: { type: "string" },
    dosage: { type: ["string", "null"] },
    unitPrice: { type: "number" },
    stockQuantity: { type: "number" },
    saleBlockedAt: { type: ["string", "null"] },
    saleBlockedReason: { type: ["string", "null"] },
    organizationId: { type: ["string", "null"] },
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
      labTests: { schema: labTestSchema },
      pharmacyItems: { schema: pharmacyItemSchema },
    });

    return db;
  })();

  return dbPromise;
}

interface PullCheckpoint {
  updatedAt: string;
  id: string;
}

// Fabrique générique de réplication pull-only "checkpoint updatedAt+id" — même schéma de
// pagination que startPatientsReplication, réutilisé tel quel par les catalogues (examens,
// pharmacie) qui n'ont besoin d'aucun chiffrement ni transformation, juste de la pagination.
function startSimplePullReplication<T extends { id: string; updatedAt: string; _deleted?: boolean }>(
  db: OfflineDatabase,
  collection: RxCollection<T>,
  replicationIdentifier: string,
  endpoint: string
) {
  return replicateRxCollection<T, PullCheckpoint>({
    collection,
    replicationIdentifier,
    live: true,
    retryTime: 10000,
    autoStart: true,
    pull: {
      batchSize: 200,
      handler: async (checkpoint, batchSize) => {
        const params = new URLSearchParams({ limit: String(batchSize) });
        if (checkpoint) {
          params.set("updatedAt", checkpoint.updatedAt);
          params.set("id", checkpoint.id);
        }
        const res = await fetch(`${endpoint}?${params.toString()}`, { credentials: "include" });
        if (!res.ok) throw new Error("Erreur lors de la synchronisation.");
        // Chaque route /api/sync/* ne renvoie que des documents avec _deleted explicitement
        // posé (jamais absent) — TypeScript ne peut pas le déduire à travers ce T générique
        // (limite connue de variance sur un générique contraint), d'où ce cast.
        const body: { documents: WithDeleted<T>[]; checkpoint: PullCheckpoint | null } = await res.json();
        return { documents: body.documents, checkpoint: body.checkpoint ?? undefined };
      },
    },
  });
}

export function startLabTestsReplication(db: OfflineDatabase) {
  return startSimplePullReplication(db, db.labTests, "lab-tests-pull-v1", "/api/sync/lab-tests");
}

export function startPharmacyItemsReplication(db: OfflineDatabase) {
  return startSimplePullReplication(db, db.pharmacyItems, "pharmacy-items-pull-v1", "/api/sync/pharmacy-items");
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
