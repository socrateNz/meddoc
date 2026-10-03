"use client";

// Garde de soumission pour les formulaires qui créent un enregistrement.
//
// - Verrou synchrone (ref) : un second clic est ignoré dès le premier événement, sans attendre le
//   re-rendu React (un état seul laisse une fenêtre où deux clics passent encore).
// - Clé d'idempotence stable : générée à la première tentative et conservée pour les suivantes
//   (retry après coupure réseau, rejeu de la file hors-ligne). Elle n'est réinitialisée qu'après un
//   succès, donc une nouvelle saisie ensuite produit bien une nouvelle création.
//
// Usage : `const { submitting, guard } = useSubmitGuard();` puis
// `await guard((key) => createX({ ...data }, key))`. Renvoie undefined si une soumission est déjà
// en cours.

import { useRef, useState, useCallback } from "react";

export function useSubmitGuard() {
  const inFlight = useRef(false);
  const keyRef = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const guard = useCallback(async <T extends { success?: boolean }>(
    submit: (idempotencyKey: string) => Promise<T>
  ): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setSubmitting(true);
    keyRef.current ??= crypto.randomUUID();
    try {
      const result = await submit(keyRef.current);
      if (result.success) keyRef.current = null;
      return result;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submitting, guard };
}
