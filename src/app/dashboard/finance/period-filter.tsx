"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarRange, Loader2 } from "lucide-react";
import {
  PERIOD_PRESETS,
  dateKeyInTz,
  formatPeriodLabel,
  isValidDateKey,
  periodToSearchString,
  type PeriodPreset,
  type ResolvedPeriod,
} from "@/lib/finance-period";

interface PeriodFilterProps {
  period: ResolvedPeriod;
  pending: boolean;
  // Navigue vers la nouvelle période (chaîne de requête sans "?"), gérée par le parent pour qu'il
  // puisse griser son contenu pendant le rechargement.
  onChange: (searchString: string) => void;
}

// Le fuseau du navigateur ne change pas pendant la vie de la page : rien à écouter.
const subscribeNever = () => () => {};

const PILL_ACTIVE = "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs";
const PILL_IDLE = "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white";

// Filtre GLOBAL de période de la page Finance : préréglages + dates personnalisées. Les dates
// futures sont désactivées (attribut max des champs date, et de toute façon ramenées à aujourd'hui
// côté serveur, cf. resolvePeriod). La période vit dans l'URL : elle survit au rechargement et peut
// se partager.
export default function PeriodFilter({ period, pending, onChange }: PeriodFilterProps) {
  // Le fuseau et le jour courant sont ceux du NAVIGATEUR. useSyncExternalStore les lit côté client
  // uniquement (le rendu serveur, en UTC, utilise l'instantané de repli) sans décalage
  // d'hydratation ; ce sont des valeurs primitives, donc stables entre deux rendus.
  const tzOffset = useSyncExternalStore(
    subscribeNever,
    () => new Date().getTimezoneOffset(),
    () => period.tzOffsetMinutes
  );
  const today = useSyncExternalStore(
    subscribeNever,
    () => dateKeyInTz(Date.now(), new Date().getTimezoneOffset()),
    () => period.today
  );

  const [showCustom, setShowCustom] = useState(period.preset === "custom");
  const [from, setFrom] = useState(period.from ?? "");
  const [to, setTo] = useState(period.to ?? "");
  // Suit la période effective (changement d'URL, bouton précédent du navigateur...) : resynchronisé
  // PENDANT le rendu quand elle change, le schéma recommandé par React plutôt qu'un effet.
  const periodKey = `${period.preset}|${period.from ?? ""}|${period.to ?? ""}`;
  const [syncedKey, setSyncedKey] = useState(periodKey);
  if (syncedKey !== periodKey) {
    setSyncedKey(periodKey);
    setFrom(period.from ?? "");
    setTo(period.to ?? "");
    setShowCustom(period.preset === "custom");
  }

  const selectPreset = (preset: PeriodPreset) => {
    setShowCustom(false);
    onChange(periodToSearchString({ preset }, tzOffset));
  };

  const customValid =
    (isValidDateKey(from) || isValidDateKey(to)) &&
    (!from || from <= today) &&
    (!to || to <= today) &&
    (!from || !to || from <= to);
  const customUnchanged = period.preset === "custom" && (period.from ?? "") === from && (period.to ?? "") === to;

  const applyCustom = () => {
    if (!customValid) return;
    onChange(periodToSearchString({ preset: "custom", from: from || null, to: to || null }, tzOffset));
  };

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-xs p-4 space-y-3 animate-fade-up">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 min-w-0">
          <CalendarRange className="h-4 w-4 text-indigo-500 shrink-0" />
          <span className="shrink-0">Période</span>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate" data-testid="period-label">
            {formatPeriodLabel(period)}
          </span>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />}
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPreset(p.key)}
              disabled={pending}
              aria-pressed={period.preset === p.key}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${period.preset === p.key ? PILL_ACTIVE : PILL_IDLE}`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            disabled={pending}
            aria-pressed={showCustom}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${showCustom ? PILL_ACTIVE : PILL_IDLE}`}
          >
            Personnalisé
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="finance-period-from" className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              Du
            </Label>
            <Input
              id="finance-period-from"
              type="date"
              value={from}
              max={to && to < today ? to : today}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finance-period-to" className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              Au
            </Label>
            <Input
              id="finance-period-to"
              type="date"
              value={to}
              min={from || undefined}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <Button
            type="button"
            onClick={applyCustom}
            disabled={!customValid || customUnchanged || pending}
            className="h-9 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Appliquer
          </Button>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Recettes, dépenses, bénéfice, journal et sessions de caisse suivent cette période (les dates futures ne sont pas
        sélectionnables). Le solde de caisse, les alertes de stock et la valorisation montrent l&apos;état actuel.
      </p>
    </div>
  );
}
