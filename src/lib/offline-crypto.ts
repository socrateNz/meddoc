"use client";

// Chiffrement applicatif des champs sensibles avant écriture dans le storage local
// (RxDB/IndexedDB) — AES-GCM (Web Crypto API native du navigateur), clé non extractible.
//
// Portée assumée : protège les données au repos si le fichier de stockage d'un appareil
// volé/perdu et éteint est extrait et lu hors du navigateur. Ne protège PAS contre un
// appareil déverrouillé pendant que l'utilisateur est connecté — le verrouillage d'écran/OS
// des tablettes reste une responsabilité de politique d'établissement, hors du contrôle
// applicatif. Alternative gratuite au plugin RxDB "encryption-crypto-js" : ce dernier
// chiffre avec AES en mode CBC non authentifié dérivé d'un mot de passe (crypto-js, sans
// AEAD), moins robuste que l'AES-GCM authentifié utilisé ici.

const DB_NAME = "meddoc-offline-crypto";
const STORE_NAME = "keys";
const KEY_ID = "device-key";

let keyPromise: Promise<CryptoKey> | null = null;

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadStoredKey(): Promise<CryptoKey | undefined> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function storeKey(key: CryptoKey): Promise<void> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Une CryptoKey non extractible reste "structured-cloneable" : IndexedDB peut la stocker et
// la relire directement sans jamais exposer le matériau de clé brut au code JS applicatif.
async function getOrCreateKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await loadStoredKey();
      if (existing) return existing;
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await storeKey(key);
      return key;
    })();
  }
  return keyPromise;
}

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

// IV aléatoire (12 octets, recommandé pour AES-GCM) préfixé au ciphertext, encodé en base64.
export async function encryptField(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return bufToBase64(combined.buffer);
}

export async function decryptField(payload: string): Promise<string> {
  const key = await getOrCreateKey();
  const combined = new Uint8Array(base64ToBuf(payload));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// Sérialise puis chiffre une valeur JSON-compatible (tableaux/objets) en une seule chaîne opaque.
export async function encryptJson(value: unknown): Promise<string> {
  return encryptField(JSON.stringify(value));
}

export async function decryptJson<T>(payload: string): Promise<T> {
  return JSON.parse(await decryptField(payload)) as T;
}
