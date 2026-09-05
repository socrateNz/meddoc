"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Trash2 } from "lucide-react";
import LabTestDialog from "./lab-test-dialog";
import { deactivateLabTest } from "@/actions/lab";
import { toast } from "sonner";

function formatFCFA(val: number) {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}

export default function CatalogView({ labTests: initial, pharmacyItems }: { labTests: any[]; pharmacyItems: any[] }) {
  const [labTests, setLabTests] = useState(initial);

  const handleUpsert = (test: any) => {
    setLabTests((prev) => {
      const exists = prev.some((t) => t.id === test.id);
      return exists ? prev.map((t) => (t.id === test.id ? test : t)) : [...prev, test];
    });
  };

  const handleDeactivate = async (id: string) => {
    const res = await deactivateLabTest(id);
    if (res.success) {
      setLabTests((prev) => prev.filter((t) => t.id !== id));
      toast.success("Examen retiré du catalogue.");
    } else {
      toast.error(res.error || "Erreur lors de la désactivation.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end animate-fade-up">
        <LabTestDialog pharmacyItems={pharmacyItems} onSuccess={handleUpsert} />
      </div>

      {labTests.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Aucun examen dans le catalogue. Ajoutez-en un pour permettre la facturation automatique.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {labTests.map((test) => (
            <Card key={test.id} className="rounded-2xl">
              <CardContent className="py-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{test.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {test.department && <Badge variant="outline" className="text-[10px]">{test.department}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{formatFCFA(test.totalPrice ?? test.basePrice ?? 0)}</Badge>
                    {test.durationMinutes != null && <Badge variant="outline" className="text-[10px]">{test.durationMinutes} min</Badge>}
                    {(test.criticalLow != null || test.criticalHigh != null) && (
                      <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
                        Seuils : {test.criticalLow ?? "—"} / {test.criticalHigh ?? "—"}
                      </Badge>
                    )}
                    {Array.isArray(test.consumables) && test.consumables.length > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                        {test.consumables.length} consommable{test.consumables.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <LabTestDialog labTest={test} pharmacyItems={pharmacyItems} onSuccess={handleUpsert} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => handleDeactivate(test.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
