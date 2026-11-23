"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  // Classes du champ lui-même (hauteur, taille du texte, bordure) — className va sur le conteneur.
  inputClassName?: string;
  // Bouton « × » pour vider le choix : à retirer quand aucune valeur vide n'est permise.
  clearable?: boolean;
  // Champ obligatoire dans un <form> : bloque l'envoi tant qu'aucune valeur n'est choisie.
  required?: boolean;
}

// Select avec recherche intégrée (filtrage au fil de la frappe) — utilisé partout où un <select>
// natif deviendrait impraticable avec beaucoup d'options (catalogue pharmacie, liste de
// patients). Basé sur @base-ui/react/combobox, déjà utilisé par ./select.tsx pour rester
// cohérent avec le reste du design system plutôt que d'introduire une nouvelle librairie.
export default function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "-- Choisir --",
  emptyText = "Aucun résultat.",
  className,
  id,
  disabled,
  inputClassName,
  clearable = true,
  required,
}: SearchableSelectProps) {
  const selected = React.useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(item) => onValueChange(item ? (item as SearchableSelectOption).value : "")}
      itemToStringLabel={(item: SearchableSelectOption) => item.label}
      isItemEqualToValue={(a: SearchableSelectOption, b: SearchableSelectOption) => a.value === b.value}
      disabled={disabled}
    >
      <Combobox.InputGroup className={cn("relative flex items-center", className)}>
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          className={cn(
            "w-full h-11 sm:h-9 pl-2.5 text-base sm:text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed",
            inputClassName,
            clearable ? "pr-14" : "pr-8",
          )}
        />
        {required && (
          // Porte la validation native du formulaire (« Veuillez sélectionner… ») : invisible, mais
          // pas en lecture seule — le navigateur ne vérifie pas les champs readonly.
          <input
            tabIndex={-1}
            aria-hidden
            required
            value={value}
            onChange={() => {}}
            className="absolute inset-x-0 bottom-0 h-px w-full opacity-0 pointer-events-none"
          />
        )}
        {clearable && (
          <Combobox.Clear className="absolute right-7 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </Combobox.Clear>
        )}
        <Combobox.Icon className="absolute right-2.5 pointer-events-none text-slate-400">
          <ChevronDown className="h-3.5 w-3.5" />
        </Combobox.Icon>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50 outline-none">
          <Combobox.Popup className="w-(--anchor-width) max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-1">
            <Combobox.Empty className="p-3 text-xs text-slate-400 text-center">{emptyText}</Combobox.Empty>
            <Combobox.List>
              {(item: SearchableSelectOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  disabled={item.disabled}
                  className="px-2.5 py-2.5 sm:py-1.5 text-sm sm:text-xs rounded-lg cursor-pointer text-slate-700 dark:text-slate-300 data-[highlighted]:bg-blue-50 dark:data-[highlighted]:bg-blue-950/30 data-[selected]:font-semibold data-[selected]:text-slate-900 dark:data-[selected]:text-white data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
                >
                  <div>{item.label}</div>
                  {item.description && <div className="text-xs text-slate-400">{item.description}</div>}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
