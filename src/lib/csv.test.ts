import { describe, it, expect } from "vitest";
import { buildCsv, parseCsv, parseDateCell, parseListCell, parseNumberCell, resolveColumns, type CsvColumn } from "./csv";

describe("parseCsv / buildCsv", () => {
  it("relit un fichier Excel français (point-virgule, BOM, guillemets, retour à la ligne dans une cellule)", () => {
    const csv = buildCsv([
      ["Nom", "Notes"],
      ["Labo; Centrale", 'Dit "le grand"\nlivre le mardi'],
    ]);
    expect(parseCsv(csv)).toEqual([
      ["Nom", "Notes"],
      ["Labo; Centrale", 'Dit "le grand"\nlivre le mardi'],
    ]);
  });

  it("accepte aussi un CSV à virgules et ignore les lignes vides", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("lecture des cellules", () => {
  it("lit les nombres français et anglais", () => {
    expect(parseNumberCell("1 500,50")).toBe(1500.5);
    expect(parseNumberCell("1500.5")).toBe(1500.5);
    expect(parseNumberCell("")).toBeUndefined();
    expect(parseNumberCell("abc")).toBeNull();
  });

  it("lit les dates JJ/MM/AAAA et AAAA-MM-JJ, refuse le reste", () => {
    expect(parseDateCell("4/3/1985")).toBe("1985-03-04");
    expect(parseDateCell("1985-03-04")).toBe("1985-03-04");
    expect(parseDateCell("32/01/2000")).toBeNull();
    expect(parseDateCell("hier")).toBeNull();
    expect(parseDateCell("")).toBeUndefined();
  });

  it("découpe les listes", () => {
    expect(parseListCell("HTA, Diabète | Asthme")).toEqual(["HTA", "Diabète", "Asthme"]);
  });
});

describe("resolveColumns", () => {
  const columns: CsvColumn[] = [
    { key: "name", header: "Nom de l'examen", aliases: ["examen"] },
    { key: "basePrice", header: "Prix maison (FCFA)", aliases: ["prix"] },
    { key: "partnerPrice", header: "Prix partenaire (FCFA)", aliases: ["prix partenaire"] },
  ];

  it("retrouve les colonnes du modèle dans n'importe quel ordre", () => {
    expect(resolveColumns(["Prix partenaire (FCFA)", "Nom de l'examen", "Prix maison (FCFA)"], columns)).toEqual({ name: 1, basePrice: 2, partnerPrice: 0 });
  });

  it("tolère des en-têtes approchants sans confondre prix maison et prix partenaire", () => {
    expect(resolveColumns(["Examen", "Prix", "Prix partenaire"], columns)).toEqual({ name: 0, basePrice: 1, partnerPrice: 2 });
  });

  it("signale une colonne absente par -1", () => {
    expect(resolveColumns(["Examen"], columns).basePrice).toBe(-1);
  });
});
