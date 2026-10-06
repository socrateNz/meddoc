"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { closeRound, setRoundParticipants, startRound } from "@/actions/rounds";
import RoundVisitDialog, { STATUS_CLASS, STATUS_LABEL, type RoundEntryView } from "./ronde-visit-dialog";

export interface RoundWardOption {
  id: string;
  name: string;
  code: string;
}

export interface RoundTeamMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface RoundData {
  session: { id: string; status: string; day: string; participantIds: string[]; closedAt: string | Date | null };
  counts: { total: number; pending: number; visited: number; skipped: number };
  entries: RoundEntryView[];
  page: number;
  pageSize: number;
  total: number;
}

interface RondeViewProps {
  clinicId: string;
  currentUserId: string;
  wards: RoundWardOption[];
  wardId: string | null;
  day: string;
  dayLabel: string;
  round: RoundData | null;
  team: RoundTeamMember[];
  query: Record<string, string | undefined>;
  pathname: string;
}

const ROLE_LABEL: Record<string, string> = { MEDECIN: "Médecin", CAREGIVER: "Soignant", COORDINATOR: "Coordinateur" };
const STATUS_TILE: Record<string, string> = {
  PENDING: "border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60",
  VISITED: "border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/60",
  SKIPPED: "border-slate-300 bg-slate-100/60 dark:bg-slate-800/40 hover:bg-slate-200/60",
};

function sameMembers(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

// Tableau de la ronde : une ligne par patient, et un bouton qui ouvre la visite dans un dialogue.
function RoundEntriesTable({ entries, sessionOpen, onOpen }: { entries: RoundEntryView[]; sessionOpen: boolean; onOpen: (entryId: string) => void }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-8">Aucun patient hospitalisé dans ce service.</p>;
  }
  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase font-bold">Lit</TableHead>
            <TableHead className="text-xs uppercase font-bold">Patient</TableHead>
            <TableHead className="text-xs uppercase font-bold">Âge · GIR</TableHead>
            <TableHead className="text-xs uppercase font-bold">Statut</TableHead>
            <TableHead className="text-xs uppercase font-bold">Dernières constantes</TableHead>
            <TableHead className="text-xs uppercase font-bold">À suivre</TableHead>
            <TableHead className="text-xs uppercase font-bold text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const p = entry.patient;
            const v = p?.lastVitals;
            const toVisit = sessionOpen && entry.status === "PENDING";
            return (
              <TableRow key={entry.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {entry.position}. {entry.bedLabel}
                </TableCell>
                <TableCell className="text-sm font-semibold">
                  {p ? `${p.lastName} ${p.firstName}` : "Patient introuvable"}
                  {p && p.allergies.length > 0 && <span className="ml-2 text-[10px] font-normal text-red-600 dark:text-red-400">allergies</span>}
                </TableCell>
                <TableCell className="text-xs">{p ? `${p.age} ans · GIR ${p.dependencyLevel}` : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_CLASS[entry.status] ?? ""}>
                    {STATUS_LABEL[entry.status] ?? entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {v
                    ? [
                        v.temperature !== null && `T° ${v.temperature}`,
                        v.bloodPressure && `TA ${v.bloodPressure}`,
                        v.heartRate !== null && `FC ${v.heartRate}`,
                        v.oxygenSaturation !== null && `SpO₂ ${v.oxygenSaturation}%`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    : "Aucune"}
                </TableCell>
                <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                  {p ? `${p.pendingTasks} soin(s) · ${p.pendingLabs} analyse(s) · ${p.openIncidents} incident(s)` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant={toVisit ? "default" : "outline"} className="h-8 rounded-xl text-xs" onClick={() => onOpen(entry.id)}>
                    {toVisit ? "Visiter" : "Voir"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// Grille du service : une section par chambre, un carré par lit. Un clic ouvre la visite du patient.
function RoundGrid({ entries, onOpen }: { entries: RoundEntryView[]; onOpen: (entryId: string) => void }) {
  const rooms = new Map<string, RoundEntryView[]>();
  for (const entry of entries) {
    const room = entry.roomName ?? "Non classés";
    rooms.set(room, [...(rooms.get(room) ?? []), entry]);
  }
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-8">Aucun patient hospitalisé dans ce service.</p>;
  }
  return (
    <div className="space-y-5">
      {[...rooms.entries()].map(([room, list]) => (
        <section key={room} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{room}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {list.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpen(entry.id)}
                className={`text-left rounded-xl border p-3 transition-colors ${STATUS_TILE[entry.status] ?? ""}`}
              >
                <p className="text-[11px] font-semibold text-slate-500">Lit {entry.bedNumber ?? "—"}</p>
                <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {entry.patient ? `${entry.patient.lastName} ${entry.patient.firstName}` : "Patient introuvable"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {STATUS_LABEL[entry.status] ?? entry.status}
                  {entry.patient && entry.patient.allergies.length > 0 ? " · allergies" : ""}
                  {entry.patient && entry.patient.openIncidents > 0 ? " · incident" : ""}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function RondeView({
  clinicId,
  currentUserId,
  wards,
  wardId,
  day,
  dayLabel,
  round,
  team,
  query,
  pathname,
}: RondeViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [mode, setMode] = useState<"liste" | "grille">("liste");
  // Patient dont la visite est ouverte dans le dialogue (null = aucun dialogue).
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  // Présents choisis localement : aucune requête tant que l'équipe n'a pas démarré ou enregistré la liste.
  // La vue est remontée (clé) à chaque nouvelle ronde, donc ce choix repart de la ronde affichée.
  const [selected, setSelected] = useState<string[]>(() => round?.session.participantIds ?? [currentUserId]);

  const selectedWard = wards.find((w) => w.id === wardId) ?? null;
  const sessionOpen = round?.session.status === "OPEN";
  const saved = round?.session.participantIds ?? [];
  const participantsChanged = round !== null && !sameMembers(selected, saved);
  // Lue dans la ronde courante : après une visite enregistrée, le dialogue reçoit les données fraîches.
  const activeEntry = round?.entries.find((e) => e.id === activeEntryId) ?? null;

  // Navigation par URL : service, jour, page. Changer de service ou de jour revient à la première page.
  const goTo = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes, page: undefined })) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const run = async (action: () => Promise<{ success: boolean; error?: string }>, okMessage?: string) => {
    setBusy(true);
    try {
      const res = await action();
      if (!res.success) {
        toast.error(res.error || "Opération impossible.");
        return false;
      }
      if (okMessage) toast.success(okMessage);
      router.refresh();
      return true;
    } catch {
      toast.error("Une erreur inattendue est survenue.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleParticipant = (userId: string) => {
    setSelected((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  };

  const doClose = async () => {
    if (!round) return;
    setBusy(true);
    try {
      const res = await closeRound(round.session.id);
      if (!res.success) {
        toast.error(res.error || "Clôture impossible.");
        return;
      }
      const pending = res.data?.pending ?? 0;
      toast.success(pending > 0 ? `Ronde clôturée (${pending} patient(s) non vu(s)).` : "Ronde clôturée.");
      setConfirmClose(false);
      router.refresh();
    } catch {
      toast.error("Une erreur inattendue est survenue.");
    } finally {
      setBusy(false);
    }
  };

  if (wards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">
        Aucun service configuré dans cette clinique. Créez les services et les lits dans « Chambres &amp; Lits ».
      </div>
    );
  }

  const progress = round && round.counts.total > 0 ? Math.round(((round.counts.visited + round.counts.skipped) / round.counts.total) * 100) : 0;

  const participantsPicker = (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Présents à la ronde</p>
      <div className="flex flex-wrap gap-2">
        {team.map((m) => {
          const present = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              disabled={busy || (round !== null && !sessionOpen)}
              onClick={() => toggleParticipant(m.id)}
              className={`px-2.5 py-1 rounded-xl border text-xs transition-colors disabled:opacity-60 ${
                present
                  ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 text-blue-700 dark:text-blue-300"
                  : "border-slate-200 dark:border-slate-800 text-slate-500"
              }`}
            >
              {present ? "✓ " : ""}
              {m.firstName} {m.lastName} <span className="text-[10px] opacity-70">({ROLE_LABEL[m.role] ?? m.role})</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Choix du service et du jour */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {wards.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => goTo({ ward: w.id, day })}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                w.id === wardId
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {w.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          Jour de la ronde
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && goTo({ ward: wardId ?? undefined, day: e.target.value })}
            className="h-9 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </label>
      </div>

      {!round ? (
        <div className="rounded-2xl border border-dashed p-10 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Aucune ronde démarrée pour <strong>{selectedWard?.name}</strong> le {dayLabel}.
            </p>
            <p className="text-xs text-slate-500">La ronde reprend les patients hospitalisés de ce service, dans l&apos;ordre des chambres.</p>
          </div>
          <div className="max-w-xl mx-auto space-y-4">
            {participantsPicker}
            <div className="text-center">
              <Button
                className="rounded-xl"
                disabled={busy || !wardId || selected.length === 0}
                onClick={() => wardId && run(() => startRound(clinicId, wardId, day, selected), "Ronde démarrée.")}
              >
                Démarrer la ronde
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedWard?.name} · {dayLabel}</h2>
                <p className="text-xs text-slate-500">
                  {round.counts.total} patient(s) hospitalisé(s) · {round.counts.visited} vu(s) · {round.counts.skipped} passé(s) · {round.counts.pending} à voir
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 rounded-xl bg-muted/40 border border-border/60">
                  {(["liste", "grille"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        mode === m ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m === "liste" ? "Liste" : "Grille"}
                    </button>
                  ))}
                </div>
                {round.session.status === "CLOSED" ? (
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/30">Ronde clôturée</Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Ronde en cours</Badge>
                )}
              </div>
            </div>

            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>

            {sessionOpen ? (
              <div className="space-y-3">
                {participantsPicker}
                {participantsChanged && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-xl"
                      disabled={busy || selected.length === 0}
                      onClick={() => run(() => setRoundParticipants(round.session.id, selected), "Présents enregistrés.")}
                    >
                      Enregistrer les présents
                    </Button>
                    <button
                      type="button"
                      onClick={() => setSelected(saved)}
                      disabled={busy}
                      className="text-xs text-slate-500 underline disabled:opacity-60"
                    >
                      Annuler les modifications
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Présents : {team.filter((m) => saved.includes(m.id)).map((m) => `${m.firstName} ${m.lastName}`).join(", ") || "aucun"}
              </p>
            )}

            {sessionOpen && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {confirmClose ? (
                  <>
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {round.counts.pending > 0 ? `${round.counts.pending} patient(s) n'ont pas été vus. ` : ""}Clôturer la ronde ?
                    </span>
                    <Button size="sm" className="rounded-xl" onClick={doClose} disabled={busy}>
                      Confirmer la clôture
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setConfirmClose(false)} disabled={busy}>
                      Annuler
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setConfirmClose(true)} disabled={busy}>
                    Clôturer la ronde
                  </Button>
                )}
              </div>
            )}
          </div>

          {mode === "grille" ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">Grille des patients affichés sur cette page.</p>
              <RoundGrid entries={round.entries} onOpen={setActiveEntryId} />
            </div>
          ) : (
            <RoundEntriesTable entries={round.entries} sessionOpen={sessionOpen} onOpen={setActiveEntryId} />
          )}

          <PaginationNav
            page={round.page}
            pageSize={round.pageSize}
            total={round.total}
            pathname={pathname}
            query={query}
            itemLabel="patient"
          />

          <RoundVisitDialog
            clinicId={clinicId}
            entry={activeEntry}
            sessionOpen={sessionOpen}
            onOpenChange={(open) => {
              if (!open) setActiveEntryId(null);
            }}
          />
        </>
      )}
    </div>
  );
}
