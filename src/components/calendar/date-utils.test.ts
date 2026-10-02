import { describe, it, expect } from "vitest";
import { layoutItemsForDay } from "./date-utils";
import type { CalendarItem } from "./types";

function item(partial: Partial<CalendarItem> & { start: Date; end: Date }): CalendarItem {
  return {
    id: partial.id || Math.random().toString(36),
    kind: "EVENT",
    title: "Item",
    canEdit: true,
    raw: null,
    ...partial,
  };
}

const DAY = new Date("2026-03-10T00:00:00");

describe("layoutItemsForDay", () => {
  it("ignore les éléments d'un autre jour", () => {
    const other = item({ start: new Date("2026-03-11T09:00:00"), end: new Date("2026-03-11T10:00:00") });
    expect(layoutItemsForDay([other], DAY)).toHaveLength(0);
  });

  it("ignore les éléments allDay (gérés par la bande 'toute la journée', pas la grille horaire)", () => {
    const allDay = item({ start: new Date("2026-03-10T09:00:00"), end: new Date("2026-03-10T10:00:00"), allDay: true });
    expect(layoutItemsForDay([allDay], DAY)).toHaveLength(0);
  });

  it("place deux éléments non chevauchants dans la même colonne pleine largeur", () => {
    const a = item({ id: "a", start: new Date("2026-03-10T08:00:00"), end: new Date("2026-03-10T09:00:00") });
    const b = item({ id: "b", start: new Date("2026-03-10T10:00:00"), end: new Date("2026-03-10T11:00:00") });

    const result = layoutItemsForDay([a, b], DAY);

    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.widthPercent).toBe(100);
      expect(r.leftPercent).toBe(0);
    }
  });

  it("place deux éléments chevauchants côte à côte (colonnes à 50%)", () => {
    const a = item({ id: "a", start: new Date("2026-03-10T08:00:00"), end: new Date("2026-03-10T09:30:00") });
    const b = item({ id: "b", start: new Date("2026-03-10T08:30:00"), end: new Date("2026-03-10T09:00:00") });

    const result = layoutItemsForDay([a, b], DAY);

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.widthPercent === 50)).toBe(true);
    const lefts = result.map((r) => r.leftPercent).sort();
    expect(lefts).toEqual([0, 50]);
  });

  it("positionne le haut proportionnellement à l'heure de début dans la fenêtre startHour-endHour", () => {
    const a = item({ start: new Date("2026-03-10T08:00:00"), end: new Date("2026-03-10T08:30:00") });
    // startHour=7 par défaut, hourHeight=64 : 08:00 = 1h après le début de la grille -> top=64
    const [r] = layoutItemsForDay([a], DAY);
    expect(r.top).toBe(64);
  });

  it("conserve une hauteur minimale pour un créneau très court", () => {
    const a = item({ start: new Date("2026-03-10T08:00:00"), end: new Date("2026-03-10T08:05:00") });
    const [r] = layoutItemsForDay([a], DAY);
    expect(r.height).toBeGreaterThanOrEqual(26);
  });
});
