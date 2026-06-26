"use client";

import { useState } from "react";
import { MoreHorizontal, Replace, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReassignMemberDialog from "./reassign-member-dialog";
import DeleteMemberAlert from "./delete-member-alert";
import ReactivateMemberAlert from "./reactivate-member-alert";

interface UserActionsMenuProps {
  member: any;
  isHoldingAdmin: boolean;
  holdingId: string;
  clinics: { id: string; name: string }[];
}

export default function UserActionsMenu({ member, isHoldingAdmin, holdingId, clinics }: UserActionsMenuProps) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const userName = `${member.firstName} ${member.lastName}`;

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
          {member.isActive ? (
            <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
              <UserX className="mr-2 h-4 w-4" />
              <span>Désactiver</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setReactivateOpen(true)} className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50 cursor-pointer">
              <UserCheck className="mr-2 h-4 w-4" />
              <span>Réactiver</span>
            </DropdownMenuItem>
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
    </>
  );
}
