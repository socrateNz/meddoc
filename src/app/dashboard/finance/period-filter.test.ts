import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PeriodFilter from "./period-filter";
import { resolvePeriod } from "@/lib/finance-period";

// Rendu serveur (le composant est un composant client, mais son premier rendu se fait aussi côté
// serveur) : vérifie l'affichage de la période et que les dates futures sont désactivées.
const NOW = Date.UTC(2026, 8, 25, 14, 0, 0);

const render = (period: ReturnType<typeof resolvePeriod>) =>
  renderToStaticMarkup(createElement(PeriodFilter, { period, pending: false, onChange: () => {} }));

describe("PeriodFilter (rendu serveur)", () => {
  it("affiche les préréglages et marque celui qui est actif", () => {
    const html = render(resolvePeriod({ preset: "7d" }, NOW));

    for (const label of ["Aujourd'hui", "7 derniers jours", "30 derniers jours", "Ce mois-ci", "Mois dernier", "Cette année", "Tout", "Personnalisé"]) {
      expect(html.replaceAll("&#x27;", "'")).toContain(label);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>7 derniers jours/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Tout/);
  });

  it("affiche la période résolue en français", () => {
    expect(render(resolvePeriod({ preset: "month" }, NOW))).toMatch(/Du 1 sept\.? au 25 sept\.? 2026/);
    expect(render(resolvePeriod({}, NOW))).toContain("Toute la période");
  });

  it("période personnalisée : champs de dates ouverts, préremplis, avec le jour courant comme maximum (dates futures désactivées)", () => {
    const html = render(resolvePeriod({ preset: "custom", from: "2026-09-01", to: "2026-09-10" }, NOW));

    // "Du" ne peut pas dépasser "Au" ; "Au" ne peut pas dépasser aujourd'hui ni précéder "Du".
    expect(html).toMatch(/id="finance-period-from"[^>]*max="2026-09-10"[^>]*value="2026-09-01"|id="finance-period-from"[^>]*value="2026-09-01"[^>]*max="2026-09-10"/);
    expect(html).toMatch(/id="finance-period-to"[^>]*max="2026-09-25"/);
    expect(html).toMatch(/id="finance-period-to"[^>]*min="2026-09-01"|min="2026-09-01"[^>]*id="finance-period-to"/);
  });

  it("préréglage : les champs de dates personnalisées restent masqués", () => {
    const html = render(resolvePeriod({ preset: "30d" }, NOW));

    expect(html).not.toContain("finance-period-from");
  });
});
