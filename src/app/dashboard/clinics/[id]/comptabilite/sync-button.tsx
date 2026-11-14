"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateMissingEntries } from "@/actions/accounting";

// « Générer les écritures manquantes » : rattrape tout document réglé sans écriture. Sans risque
// d'être relancé (une écriture au plus par document).
export default function SyncButton({ organizationId, missing }: { organizationId: string; missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    let res: Awaited<ReturnType<typeof generateMissingEntries>>;
    try {
      res = await generateMissingEntries(organizationId);
    } catch {
      // Réponse jamais reçue (délai dépassé côté serveur web, connexion coupée...). Le travail déjà
      // fait est conservé : relancer reprend sans doublon.
      setBusy(false);
      toast.error("La génération n'a pas pu aller jusqu'au bout (délai dépassé ou connexion coupée). Ce qui a été fait est conservé : recliquez pour continuer.", { duration: 15000 });
      router.refresh();
      return;
    }
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    const { created, errors } = res.data;
    if (errors.length) toast.warning(`${created} écriture(s) créée(s), ${errors.length} document(s) en erreur : ${errors[0].message}`, { duration: 10000 });
    else toast.success(created ? `${created} écriture(s) créée(s).` : "Tout est déjà comptabilisé.");
    router.refresh();
  };

  return (
    <Button onClick={run} disabled={busy} variant={missing > 0 ? "default" : "outline"} className="gap-2 rounded-xl">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Générer les écritures manquantes{missing > 0 ? ` (${missing})` : ""}
    </Button>
  );
}
