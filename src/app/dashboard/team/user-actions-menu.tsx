"use client";

import { useState } from "react";
import { MoreHorizontal, Replace, UserX, UserCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReassignMemberDialog from "./reassign-member-dialog";
import DeleteMemberAlert from "./delete-member-alert";
import ReactivateMemberAlert from "./reactivate-member-alert";
import ReclassifyRoleDialog from "./reclassify-role-dialog";

interface UserActionsMenuProps {
  member: any;
  isHoldingAdmin: boolean;
  holdingId: string;
  clinics: { id: string; name: string }[];
  currentUserRole?: string;
}

export default function UserActionsMenu({ member, isHoldingAdmin, holdingId, clinics, currentUserRole }: UserActionsMenuProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const userName = `${member.firstName} ${member.lastName}`;

  // COORDINATOR ne gère que le personnel (médecin/infirmier/pharmacien) de sa clinique ;
  // ADMIN (holding) ne gère plus que les coordinateurs — reflète team.ts:assertCanManageStaffMember.
  const canManageStatus =
    (currentUserRole === "COORDINATOR" && ["MEDECIN", "CAREGIVER", "PHARMACIST", "CASHIER"].includes(member.role)) ||
    (currentUserRole === "ADMIN" && member.role === "COORDINATOR");

  // Bascule Médecin ⇄ Infirmier(e) : seul un COORDINATOR peut reclasser son propre personnel
  // clinique (cf. team.ts:reclassifyRole), disponible en permanence (pas qu'au déploiement).
  const canReclassify = currentUserRole === "COORDINATOR" && ["MEDECIN", "CAREGIVER"].includes(member.role) && member.isActive;
  const reclassifyTarget: "MEDECIN" | "CAREGIVER" = member.role === "MEDECIN" ? "CAREGIVER" : "MEDECIN";

  if (!canManageStatus && !canReclassify && !isHoldingAdmin) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="-mr-2 h-8 w-8 hover:bg-background/50" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isHoldingAdmin && member.isActive && (
            <DropdownMenuItem onClick={() => setReassignOpen(true)} className="cursor-pointer">
              <Replace className="mr-2 h-4 w-4" />
              <span>Réaffecter</span>
            </DropdownMenuItem>
          )}
          {canReclassify && (
            <DropdownMenuItem onClick={() => setReclassifyOpen(true)} className="cursor-pointer">
              <Stethoscope className="mr-2 h-4 w-4" />
              <span>Marquer comme {reclassifyTarget === "MEDECIN" ? "Médecin" : "Infirmier(e)"}</span>
            </DropdownMenuItem>
          )}
          {canManageStatus && (
            member.isActive ? (
              <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                <UserX className="mr-2 h-4 w-4" />
                <span>Désactiver</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setReactivateOpen(true)} className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 cursor-pointer">
                <UserCheck className="mr-2 h-4 w-4" />
                <span>Réactiver</span>
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Render Modals OUTSIDE the DropdownMenu so they don't unmount when it closes */}
      {isHoldingAdmin && (
        <ReassignMemberDialog 
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          userId={member.id} 
          userName={userName}
          currentOrganizationId={member.organizationId || ""}
          holdingId={holdingId}
          clinics={clinics}
        />
      )}
      <DeleteMemberAlert 
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        userId={member.id} 
        userName={userName} 
      />
      <ReactivateMemberAlert
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        userId={member.id}
        userName={userName}
      />
      {canReclassify && (
        <ReclassifyRoleDialog
          open={reclassifyOpen}
          onOpenChange={setReclassifyOpen}
          userId={member.id}
          userName={userName}
          targetRole={reclassifyTarget}
        />
      )}
    </>
  );
}
