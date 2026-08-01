"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { togglePermissionRole } from "@/actions/permissions";

const ROLES = ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "CAREGIVER", "PHARMACIST", "FAMILY", "PATIENT"] as const;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  COORDINATOR: "Coordinateur",
  CAREGIVER: "Aidant",
  PHARMACIST: "Pharmacien(ne)",
  FAMILY: "Famille",
  PATIENT: "Patient",
};

interface PermissionRow {
  id: string;
  name: string;
  description: string | null;
  roles: string[];
}

export default function PermissionsMatrix({ permissions }: { permissions: PermissionRow[] }) {
  const [rows, setRows] = useState(permissions);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const handleToggle = async (permissionId: string, role: string, currentlyChecked: boolean) => {
    const key = `${permissionId}-${role}`;
    setPendingKey(key);

    // Mise à jour optimiste
    setRows((prev) =>
      prev.map((p) =>
        p.id === permissionId
          ? { ...p, roles: currentlyChecked ? p.roles.filter((r) => r !== role) : [...p.roles, role] }
          : p
      )
    );

    const res = await togglePermissionRole(permissionId, role);
    setPendingKey(null);

    if (!res.success) {
      toast.error(res.error || "Erreur lors de la mise à jour.");
      // Rollback
      setRows((prev) =>
        prev.map((p) =>
          p.id === permissionId
            ? { ...p, roles: currentlyChecked ? [...p.roles, role] : p.roles.filter((r) => r !== role) }
            : p
        )
      );
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="min-w-[240px]">Permission</TableHead>
            {ROLES.map((role) => (
              <TableHead key={role} className="text-center whitespace-nowrap">
                {ROLE_LABELS[role]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((permission) => (
            <TableRow key={permission.id} className="hover:bg-muted/20">
              <TableCell>
                <p className="font-mono text-xs font-semibold">{permission.name}</p>
                {permission.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{permission.description}</p>
                )}
              </TableCell>
              {ROLES.map((role) => {
                const checked = permission.roles.includes(role);
                const key = `${permission.id}-${role}`;
                return (
                  <TableCell key={role} className="text-center">
                    <Checkbox
                      checked={checked}
                      disabled={pendingKey === key}
                      onCheckedChange={() => handleToggle(permission.id, role, checked)}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
