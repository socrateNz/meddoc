"use client";

import { useState } from "react";
import { Ban, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import SaleBlockDialog from "@/app/dashboard/finance/sale-block-dialog";
import DeletePharmacyItemDialog from "@/app/dashboard/finance/delete-pharmacy-item-dialog";

// Actions de supervision d'un produit (coordinateur) rangées dans un menu « … » : sur la ligne,
// seule l'action courante (Modifier) reste visible.
export default function PharmacyItemMenu({ item }: { item: { id: string; name: string; dosage?: string | null; saleBlockedAt?: unknown; saleBlockedReason?: string | null } }) {
  const [opened, setOpened] = useState<null | "block" | "delete">(null);
  const isBlocked = !!item.saleBlockedAt;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label={`Autres actions sur ${item.name}`} />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpened("block")} className="cursor-pointer">
            {isBlocked ? <ShieldCheck className="mr-2 h-4 w-4 text-emerald-600" /> : <Ban className="mr-2 h-4 w-4 text-rose-600" />}
            <span>{isBlocked ? "Débloquer la vente" : "Bloquer la vente"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpened("delete")} className="cursor-pointer text-rose-600 focus:text-rose-600">
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Supprimer le produit</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {opened === "block" && <SaleBlockDialog item={item} autoOpen onClosed={() => setOpened(null)} />}
      {opened === "delete" && <DeletePharmacyItemDialog item={item} autoOpen onClosed={() => setOpened(null)} />}
    </>
  );
}
