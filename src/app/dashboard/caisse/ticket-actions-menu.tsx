"use client";

import { useState } from "react";
import { BadgePercent, MoreHorizontal, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import InvoiceDiscountDialog from "./invoice-discount-dialog";
import CloseInvoiceDialog from "./close-invoice-dialog";
import { EditInvoiceStatusDialog } from "./edit-invoice-status-dialog";

// Actions secondaires d'un ticket de caisse, rangées dans un menu « … » : sur chaque ligne, seule
// l'action principale (Encaisser) reste visible — le caissier n'a pas à lire quatre boutons avant
// d'agir. Chaque fenêtre n'est montée qu'à l'ouverture (données du ticket toujours à jour).
type Props = {
  invoice: any;
  invoiceTotalAmount: number;
  patientName: string;
  canDiscount: boolean;
  canClose: boolean;
  canManageStatus: boolean;
  onSuccess: () => void;
};

export default function TicketActionsMenu({ invoice, invoiceTotalAmount, patientName, canDiscount, canClose, canManageStatus, onSuccess }: Props) {
  const [opened, setOpened] = useState<null | "discount" | "close" | "status">(null);
  const close = () => setOpened(null);
  const discountable = canDiscount && invoice.status === "PENDING" && !(Number(invoice.amountPaid) > 0);
  const closable = canClose && !["PAID", "CANCELLED"].includes(invoice.status);
  if (!discountable && !closable && !canManageStatus) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Autres actions sur le ticket" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {discountable && (
            <DropdownMenuItem onClick={() => setOpened("discount")} className="cursor-pointer">
              <BadgePercent className="mr-2 h-4 w-4 text-violet-600" />
              <span>Accorder une réduction</span>
            </DropdownMenuItem>
          )}
          {closable && (
            <DropdownMenuItem onClick={() => setOpened("close")} className="cursor-pointer">
              <XCircle className="mr-2 h-4 w-4" />
              <span>Abandonner le reste à payer</span>
            </DropdownMenuItem>
          )}
          {canManageStatus && (
            <DropdownMenuItem onClick={() => setOpened("status")} className="cursor-pointer">
              <RotateCcw className="mr-2 h-4 w-4 text-amber-600" />
              <span>Corriger le statut</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {opened === "discount" && (
        <InvoiceDiscountDialog
          open
          onOpenChange={(v) => !v && close()}
          pendingInvoice={invoice}
          patientName={patientName}
          onSuccess={onSuccess}
        />
      )}
      {opened === "close" && (
        <CloseInvoiceDialog
          open
          onOpenChange={(v) => !v && close()}
          pendingInvoice={{
            id: invoice.id,
            invoiceTotalAmount,
            amountPaid: invoice.amountPaid,
            patient: invoice.patient,
            customPatientName: invoice.customPatientName,
            customPatientPhone: invoice.customPatientPhone,
            cartLines: invoice.cartLines,
            labLines: invoice.labLines,
            labConsumablesDispensedAt: invoice.labConsumablesDispensedAt,
          }}
          onSuccess={() => {
            close();
            onSuccess();
          }}
        />
      )}
      {opened === "status" && (
        <EditInvoiceStatusDialog
          open
          onOpenChange={(v) => !v && close()}
          pendingInvoice={{
            id: invoice.id,
            status: invoice.status,
            amountPaid: invoice.amountPaid,
            invoiceTotalAmount,
            patient: invoice.patient,
            customPatientName: invoice.customPatientName,
          }}
          onSuccess={() => {
            close();
            onSuccess();
          }}
        />
      )}
    </>
  );
}
