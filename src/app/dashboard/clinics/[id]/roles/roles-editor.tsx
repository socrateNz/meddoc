"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RotateCcw, Save, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomRole,
  deleteCustomRole,
  resetBuiltInRole,
  saveBuiltInRole,
  updateCustomRole,
  type ClinicRolesData,
} from "@/actions/clinic-roles";

type Group = { name: string; permissions: { key: string; label: string }[] };
// Sélection : un rôle intégré (par son code), un rôle créé (par son id), ou un nouveau rôle.
type Selection = { kind: "builtIn"; role: string } | { kind: "custom"; id: string } | { kind: "new" };

export default function RolesEditor({
  clinicId,
  groups,
  roleLabels,
  roleDescriptions,
  initial,
}: {
  clinicId: string;
  groups: Group[];
  roleLabels: Record<string, string>;
  roleDescriptions: Record<string, string>;
  initial: ClinicRolesData;
}) {
  const router = useRouter();
  const data = initial;
  const [selection, setSelection] = useState<Selection>({ kind: "builtIn", role: initial.builtIn[0]?.role ?? "MEDECIN" });

  const current = useMemo(() => {
    if (selection.kind === "builtIn") {
      const r = data.builtIn.find((b) => b.role === selection.role);
      return r ? { key: `b:${r.role}`, name: roleLabels[r.role] ?? r.role, description: roleDescriptions[r.role] ?? "", permissions: r.permissions, defaults: r.defaults, customized: r.customized, memberCount: r.memberCount } : null;
    }
    if (selection.kind === "custom") {
      const r = data.custom.find((c) => c.id === selection.id);
      return r ? { key: `c:${r.id}`, name: r.name, description: r.description ?? "", permissions: r.permissions, defaults: null, customized: false, memberCount: r.memberCount } : null;
    }
    return { key: "new", name: "", description: "", permissions: [] as string[], defaults: null, customized: false, memberCount: 0 };
  }, [selection, data, roleLabels, roleDescriptions]);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <RoleList title="Rôles de MedDoc">
          {data.builtIn.map((r) => (
            <RoleButton
              key={r.role}
              active={selection.kind === "builtIn" && selection.role === r.role}
              onClick={() => setSelection({ kind: "builtIn", role: r.role })}
              name={roleLabels[r.role] ?? r.role}
              hint={r.customized ? "Ajusté" : "Par défaut"}
              hintTone={r.customized ? "amber" : "slate"}
              count={r.memberCount}
            />
          ))}
        </RoleList>
        <RoleList title="Rôles de la clinique">
          {data.custom.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Aucun pour l&apos;instant.</p>}
          {data.custom.map((r) => (
            <RoleButton
              key={r.id}
              active={selection.kind === "custom" && selection.id === r.id}
              onClick={() => setSelection({ kind: "custom", id: r.id })}
              name={r.name}
              hint={`${r.permissions.length} permission${r.permissions.length > 1 ? "s" : ""}`}
              hintTone="slate"
              count={r.memberCount}
            />
          ))}
          <Button variant="outline" size="sm" className="mt-1 w-full justify-start gap-2" onClick={() => setSelection({ kind: "new" })}>
            <Plus className="h-4 w-4" /> Nouveau rôle
          </Button>
        </RoleList>
      </aside>

      {current && (
        <RoleForm
          key={current.key}
          clinicId={clinicId}
          groups={groups}
          selection={selection}
          initialName={current.name}
          initialDescription={current.description}
          initialPermissions={current.permissions}
          defaults={current.defaults}
          customized={current.customized}
          memberCount={current.memberCount}
          onSaved={(id) => {
            if (id) setSelection({ kind: "custom", id });
            router.refresh();
          }}
          onDeleted={() => {
            setSelection({ kind: "builtIn", role: data.builtIn[0]?.role ?? "MEDECIN" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RoleList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/60 p-2 dark:border-slate-800 dark:bg-slate-900/50">
      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RoleButton({ active, onClick, name, hint, hintTone, count }: { active: boolean; onClick: () => void; name: string; hint: string; hintTone: "amber" | "slate"; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        <span className={`block text-xs ${hintTone === "amber" ? "text-amber-600" : "text-muted-foreground"}`}>{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Membres actifs">
        <Users className="h-3.5 w-3.5" />
        {count}
      </span>
    </button>
  );
}

function RoleForm({
  clinicId,
  groups,
  selection,
  initialName,
  initialDescription,
  initialPermissions,
  defaults,
  customized,
  memberCount,
  onSaved,
  onDeleted,
}: {
  clinicId: string;
  groups: Group[];
  selection: Selection;
  initialName: string;
  initialDescription: string;
  initialPermissions: readonly string[];
  defaults: readonly string[] | null;
  customized: boolean;
  memberCount: number;
  onSaved: (newId?: string) => void;
  onDeleted: () => void;
}) {
  const isBuiltIn = selection.kind === "builtIn";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [perms, setPerms] = useState<Set<string>>(() => new Set(initialPermissions));
  const [busy, setBusy] = useState<null | "save" | "reset" | "delete">(null);
  const defaultSet = useMemo(() => (defaults ? new Set(defaults) : null), [defaults]);

  const toggle = (key: string, on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleGroup = (group: Group, on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });

  const dirty =
    name !== initialName ||
    description !== initialDescription ||
    perms.size !== initialPermissions.length ||
    initialPermissions.some((p) => !perms.has(p));

  const save = async () => {
    setBusy("save");
    const list = [...perms];
    const res =
      selection.kind === "builtIn"
        ? await saveBuiltInRole(clinicId, selection.role, list)
        : selection.kind === "custom"
          ? await updateCustomRole(clinicId, selection.id, { name, description, permissions: list })
          : await createCustomRole(clinicId, { name, description, permissions: list });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(selection.kind === "new" ? "Rôle créé. Attribuez-le depuis la page Équipe." : "Rôle enregistré. Les membres concernés le verront dans la minute.");
    onSaved("id" in res ? (res.id as string) : undefined);
  };

  const reset = async () => {
    if (selection.kind !== "builtIn") return;
    if (!confirm("Revenir aux permissions par défaut de ce rôle ?")) return;
    setBusy("reset");
    const res = await resetBuiltInRole(clinicId, selection.role);
    setBusy(null);
    if (!res.success) return void toast.error(res.error);
    toast.success("Permissions par défaut rétablies.");
    onSaved();
  };

  const remove = async () => {
    if (selection.kind !== "custom") return;
    const who = memberCount > 0 ? ` Il sera retiré à ${memberCount} membre${memberCount > 1 ? "s" : ""}.` : "";
    if (!confirm(`Supprimer le rôle « ${initialName} » ?${who}`)) return;
    setBusy("delete");
    const res = await deleteCustomRole(clinicId, selection.id);
    setBusy(null);
    if (!res.success) return void toast.error(res.error);
    toast.success("Rôle supprimé.");
    onDeleted();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 dark:border-slate-800 dark:bg-slate-900/50">
      {isBuiltIn ? (
        <div>
          <h2 className="text-lg font-semibold">{initialName}</h2>
          {initialDescription && <p className="text-sm text-muted-foreground">{initialDescription}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            S&apos;applique aux {memberCount} membre{memberCount > 1 ? "s" : ""} qui ont ce rôle. Les cases marquées « défaut » sont les permissions d&apos;origine de MedDoc.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="role-name">Nom du rôle</label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Major de service" maxLength={60} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="role-description">Description (facultatif)</label>
            <Textarea id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={1} maxLength={300} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            <UserPlus className="mr-1 inline h-3.5 w-3.5" />
            Ce rôle s&apos;ajoute au rôle principal d&apos;un membre : il lui donne ces permissions en plus des siennes. Attribution depuis la page Équipe.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => {
          const owned = group.permissions.filter((p) => perms.has(p.key)).length;
          return (
            <fieldset key={group.name} className="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800">
              <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold">
                {group.name}
                <span className="flex items-center gap-2 text-xs font-normal">
                  <button type="button" className="text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => toggleGroup(group, true)}>Tout</button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => toggleGroup(group, false)}>Aucun</button>
                  <span className="text-muted-foreground">{owned}/{group.permissions.length}</span>
                </span>
              </legend>
              <div className="space-y-1.5">
                {group.permissions.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={perms.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                    <span className="flex-1">{p.label}</span>
                    {defaultSet?.has(p.key) && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800">défaut</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 dark:border-slate-800">
        <div className="flex gap-2">
          {isBuiltIn && customized && (
            <Button variant="outline" onClick={reset} disabled={!!busy} className="gap-2">
              {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Permissions par défaut
            </Button>
          )}
          {selection.kind === "custom" && (
            <Button variant="outline" onClick={remove} disabled={!!busy} className="gap-2 text-red-600 hover:text-red-700">
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Supprimer
            </Button>
          )}
        </div>
        <Button onClick={save} disabled={!!busy || (!dirty && selection.kind !== "new") || (!isBuiltIn && name.trim().length < 2)} className="gap-2">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {selection.kind === "new" ? "Créer le rôle" : "Enregistrer"}
        </Button>
      </div>
    </section>
  );
}
