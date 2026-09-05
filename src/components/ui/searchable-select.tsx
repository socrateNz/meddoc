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
          className="w-full h-9 pl-2.5 pr-14 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <Combobox.Clear className="absolute right-7 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <X className="h-3.5 w-3.5" />
        </Combobox.Clear>
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
                  className="px-2.5 py-1.5 text-xs rounded-lg cursor-pointer text-slate-700 dark:text-slate-300 data-[highlighted]:bg-blue-50 dark:data-[highlighted]:bg-blue-950/30 data-[selected]:font-semibold data-[selected]:text-slate-900 dark:data-[selected]:text-white data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
                >
                  <div>{item.label}</div>
                  {item.description && <div className="text-[10px] text-slate-400">{item.description}</div>}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
