"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setMemberExtraRoles } from "@/actions/clinic-roles";
import { toast } from "sonner";

// Rôles de la clinique attribués EN PLUS du rôle principal d'un membre (cf. ClinicRole) : leurs
// permissions s'ajoutent aux siennes. Coordinateur de la clinique uniquement.
export default function MemberRolesDialog({
  open,
  onOpenChange,
  userId,
  userName,
  organizationId,
  roles,
  currentRoleIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  organizationId: string;
  roles: { id: string; name: string }[];
  currentRoleIds: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(currentRoleIds);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    const res = await setMemberExtraRoles(organizationId, userId, selected);
    setSaving(false);
    if (res.success) {
      toast.success("Rôles enregistrés. Pris en compte dans la minute.");
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setSelected(currentRoleIds);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>Rôles additionnels de {userName}</DialogTitle>
          <DialogDescription>
            Les permissions des rôles cochés s&apos;ajoutent à celles de son rôle principal.
          </DialogDescription>
        </DialogHeader>
        {roles.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Aucun rôle créé.{" "}
            <Link href={`/dashboard/clinics/${organizationId}/roles`} className="font-medium text-emerald-700 underline">
              Créer un rôle
            </Link>
          </p>
        ) : (
          <div className="space-y-1.5">
            {roles.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/70 px-3 py-2.5 dark:border-slate-800">
                <input type="checkbox" className="h-5 w-5 sm:h-4 sm:w-4" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                <span className="text-sm">{r.name}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving || roles.length === 0} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
