"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Impression du relevé (le reste de la page est masqué à l'impression, cf. print:hidden).
export default function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Imprimer le relevé
    </Button>
  );
}
