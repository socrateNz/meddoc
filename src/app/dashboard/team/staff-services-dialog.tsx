"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listClinicServices, setStaffServices } from "@/actions/clinic-services";
import { toast } from "sonner";

// Services auxquels un médecin/infirmier est rattaché : il ne verra que leurs dossiers. Aucun
// service coché = tous les services.
export default function StaffServicesDialog({
  open,
  onOpenChange,
  userId,
  userName,
  organizationId,
  currentServiceIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  organizationId: string;
  currentServiceIds: string[];
}) {
  const router = useRouter();
  const [services, setServices] = useState<{ id: string; name: string; isTransversal: boolean }[] | null>(null);
  const [selected, setSelected] = useState<string[]>(currentServiceIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listClinicServices(organizationId).then((res) => {
      if (cancelled) return;
      setServices(res.success ? res.data.map((s) => ({ id: s.id, name: s.name, isTransversal: s.isTransversal })) : []);
      if (!res.success) toast.error(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    const res = await setStaffServices({ userId, serviceIds: selected });
    setSaving(false);
    if (res.success) {
      toast.success(selected.length ? "Services enregistrés." : "Rattaché à tous les services.");
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
        if (v) setSelected(currentServiceIds);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>Services de {userName}</DialogTitle>
          <DialogDescription>
            Ce membre ne verra que les dossiers des services cochés. Aucun service coché : il voit tous les patients de la clinique.
          </DialogDescription>
        </DialogHeader>
        {services === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : services.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Aucun service créé. Le coordinateur les crée dans Configuration &gt; Services de la clinique.
          </p>
        ) : (
          <div className="space-y-1.5">
            {services.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/70 px-3 py-2.5 dark:border-slate-800">
                <input type="checkbox" className="h-5 w-5 sm:h-4 sm:w-4" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                <span className="text-sm">
                  {s.name}
                  {s.isTransversal && <span className="ml-2 text-xs text-muted-foreground">(transversal : voit tous les patients)</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving || services === null || services.length === 0} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
