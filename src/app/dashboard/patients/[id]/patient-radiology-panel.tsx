"use client";

import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { listRadiologyOrders } from "@/actions/radiology";
import NewRadiologyOrderDialog from "@/app/dashboard/clinics/[id]/imagerie/new-radiology-order-dialog";
import RadiologyOrderList, { type RadiologyOrderRow } from "@/app/dashboard/clinics/[id]/imagerie/radiology-order-list";

// Onglet « Imagerie » du dossier patient : examens prescrits et prescription d'un nouvel examen.
export default function PatientRadiologyPanel({ patientId, clinicId, canOrder }: { patientId: string; clinicId: string; canOrder: boolean }) {
  const [orders, setOrders] = useState<RadiologyOrderRow[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listRadiologyOrders({ patientId }).then((res) => {
      if (!cancelled) setOrders(res.success ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId, reloadKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-blue-500" />
          Examens d&apos;imagerie
        </h3>
        {canOrder && <NewRadiologyOrderDialog patientId={patientId} clinicId={clinicId} onCreated={() => setReloadKey((k) => k + 1)} />}
      </div>
      {orders === null ? <p className="text-xs text-muted-foreground">Chargement...</p> : <RadiologyOrderList orders={orders} clinicId={clinicId} showPatient={false} />}
    </div>
  );
}
