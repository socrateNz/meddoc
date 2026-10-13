"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createIntegrationClient, listIntegrationClients, revokeIntegrationClient } from "@/actions/integrations";
import { INTEGRATION_SCOPES, INTEGRATION_SCOPE_LABELS, type IntegrationScope } from "@/lib/integration-keys";

type Client = Extract<Awaited<ReturnType<typeof listIntegrationClients>>, { success: true }>["data"][number];

const noopSubscribe = () => () => {};
const formatDateTime = (d: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

// Interopérabilité : clés d'API des automates de laboratoire (HL7) et des logiciels tiers (FHIR).
export default function IntegrationsCard({ clinicId, clients, canManage }: { clinicId: string; clients: Client[]; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<IntegrationScope[]>(["hl7:lab"]);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await createIntegrationClient({ clinicId, name: name.trim(), scopes });
    setSaving(false);
    if (res.success) {
      setNewKey(res.data.key);
      setName("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const revoke = async (id: string) => {
    const res = await revokeIntegrationClient(id);
    setRevoking(null);
    if (res.success) {
      toast.success("Clé révoquée : le système externe n'a plus accès.");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copié."),
      () => toast.error("Copie impossible : sélectionnez et copiez à la main.")
    );
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          Interopérabilité (HL7 / FHIR)
        </CardTitle>
        <CardDescription>
          Clés d&apos;accès des automates de laboratoire et des logiciels tiers. Chaque clé ne voit que les données de cette clinique ; tous ses accès sont tracés dans le journal d&apos;audit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {newKey && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Copiez cette clé maintenant : elle ne sera plus jamais affichée.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-white dark:bg-slate-900 px-2 py-1.5 text-xs">{newKey}</code>
              <Button size="sm" variant="outline" onClick={() => copy(newKey)} className="gap-1">
                <Copy className="h-3.5 w-3.5" />
                Copier
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>
              J&apos;ai copié la clé
            </Button>
          </div>
        )}

        {canManage && (
          <form onSubmit={create} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du système (ex: Automate Mindray BC-5150)" className="rounded-xl" maxLength={80} />
            <div className="space-y-1.5">
              {INTEGRATION_SCOPES.map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="font-mono text-xs">{s}</span> — {INTEGRATION_SCOPE_LABELS[s]}
                  </span>
                </label>
              ))}
            </div>
            <Button type="submit" disabled={saving || name.trim().length < 2 || scopes.length === 0} className="gap-2 rounded-xl">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Créer une clé
            </Button>
          </form>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
          {clients.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Aucune intégration.</p>
          ) : (
            clients.map((c) => (
              <div key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${c.isActive ? "" : "line-through text-muted-foreground"}`}>
                    {c.name} <span className="font-mono text-xs text-muted-foreground">mdk_{c.keyPrefix}_…</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.scopes.join(", ")} • {c.lastUsedAt ? `dernier accès ${formatDateTime(c.lastUsedAt)}` : "jamais utilisée"}
                  </p>
                </div>
                {c.isActive ? (
                  canManage &&
                  (revoking === c.id ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="destructive" onClick={() => revoke(c.id)}>
                        Confirmer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRevoking(null)}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRevoking(c.id)}>
                      Révoquer
                    </Button>
                  ))
                ) : (
                  <Badge variant="outline">Révoquée</Badge>
                )}
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 text-xs space-y-1.5">
          <p className="font-semibold">Points d&apos;accès (en-tête « Authorization: Bearer &lt;clé&gt; »)</p>
          <p>
            <span className="font-mono">GET {origin}/api/hl7/worklist</span> — liste de travail de l&apos;automate (ORM^O01)
          </p>
          <p>
            <span className="font-mono">POST {origin}/api/hl7/oru</span> — résultats de l&apos;automate (ORU^R01), réponse ACK. Les résultats importés restent à valider.
          </p>
          <p>
            <span className="font-mono">GET {origin}/api/fhir/Patient?identifier=IPP-…</span>, <span className="font-mono">/Patient/&lt;id&gt;/$everything</span>,{" "}
            <span className="font-mono">/Observation?patient=…</span>, <span className="font-mono">/DiagnosticReport?patient=…</span> — FHIR R4, lecture seule
          </p>
          <p className="text-muted-foreground">Un automate en MLLP (TCP) nécessite une passerelle MLLP ↔ HTTPS, fournie par la plupart des middlewares de laboratoire.</p>
        </div>
      </CardContent>
    </Card>
  );
}
