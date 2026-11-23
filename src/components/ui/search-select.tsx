"use client";

import * as React from "react";
import SearchableSelect, { type SearchableSelectOption } from "./searchable-select";

// Remplaçant direct d'un <select> natif, avec recherche au fil de la frappe : mêmes props (value,
// onChange(e) → e.target.value, disabled, required, id, className) et mêmes enfants (<option>,
// <optgroup>). Il suffit de remplacer <select …> par <SearchSelect …>.
//
// - Une <option value=""> sert de texte d'invite (« -- Sélectionner un produit -- », « Toutes les
//   paillasses ») et permet de vider le choix (×) ; sans elle, le choix ne peut pas être vidé.
// - Le libellé d'un <optgroup> s'affiche sous chaque option du groupe.
// - className : la largeur / la place dans la grille va au conteneur, le reste (hauteur, bordure,
//   taille du texte) au champ.

type SearchSelectProps = {
  value: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children?: React.ReactNode;
  className?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  title?: string;
  "aria-label"?: string;
  emptyText?: string;
};

function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function collectOptions(children: React.ReactNode, group: string | undefined, out: { options: SearchableSelectOption[]; placeholder?: string }) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      collectOptions((child.props as { children?: React.ReactNode }).children, group, out);
      return;
    }
    if (child.type === "optgroup") {
      const props = child.props as { label?: string; children?: React.ReactNode };
      collectOptions(props.children, props.label, out);
      return;
    }
    if (child.type === "option") {
      const props = child.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean };
      const label = nodeText(props.children).replace(/\s+/g, " ").trim();
      const value = props.value != null ? String(props.value) : label;
      if (value === "") {
        if (out.placeholder === undefined) out.placeholder = label;
        return;
      }
      out.options.push({ value, label, description: group, disabled: props.disabled });
    }
  });
}

const LAYOUT_CLASS = /^(?:[a-z0-9]+:)*(?:w-|max-w-|min-w-|col-span|col-start|row-span|flex-|grow|shrink|basis-|self-|justify-self|order-|m[trblxy]?-|-m[trblxy]?-)/;

export default function SearchSelect({ value, onChange, children, className, id, disabled, required, title, emptyText, ...rest }: SearchSelectProps) {
  const { options, placeholder } = React.useMemo(() => {
    const out: { options: SearchableSelectOption[]; placeholder?: string } = { options: [] };
    collectOptions(children, undefined, out);
    return out;
  }, [children]);

  const [layoutClass, inputClass] = React.useMemo(() => {
    const layout: string[] = [];
    const input: string[] = [];
    for (const c of (className ?? "").split(/\s+/).filter(Boolean)) (LAYOUT_CLASS.test(c) ? layout : input).push(c);
    return [layout.join(" "), input.join(" ")];
  }, [className]);

  // Sans largeur imposée, un <select> natif prend la largeur de sa plus longue option : même chose
  // ici (sinon le champ prendrait une largeur fixe, trop grande dans les barres de filtres).
  const hasWidth = /(?:^|\s)(?:[a-z0-9]+:)*(?:w-|flex-1|grow|basis-|col-span)/.test(layoutClass);
  const autoWidth = React.useMemo(() => {
    const longest = Math.max((placeholder ?? "").length, ...options.map((o) => o.label.length), 6);
    return `calc(${Math.min(longest, 48)}ch + ${placeholder !== undefined ? "4.5rem" : "3rem"})`;
  }, [options, placeholder]);

  const handleChange = (next: string) => {
    if (next === value) return;
    if (next === "" && placeholder === undefined) return; // aucune valeur vide permise
    const target = { value: next, name: rest.name ?? "", id: id ?? "" } as unknown as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div
      className={layoutClass || undefined}
      style={hasWidth ? undefined : { width: autoWidth, maxWidth: "100%" }}
      title={title}
      aria-label={rest["aria-label"]}
    >
      <SearchableSelect
        id={id}
        value={value}
        onValueChange={handleChange}
        options={options}
        placeholder={placeholder ?? "-- Choisir --"}
        emptyText={emptyText}
        disabled={disabled}
        required={required}
        clearable={placeholder !== undefined}
        inputClassName={inputClass}
      />
    </div>
  );
}
