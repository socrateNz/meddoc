import { describe, it, expect, vi } from "vitest";
import { SERVICE_UNAVAILABLE_MESSAGE, toErrorMessage } from "./utils";

describe("toErrorMessage", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  it("laisse passer les messages écrits pour l'utilisateur", () => {
    expect(toErrorMessage(new Error("Non autorisé. Réservé aux coordinateurs."), "Erreur.")).toBe("Non autorisé. Réservé aux coordinateurs.");
  });

  it("remplace une base de données injoignable par un message clair", () => {
    const err = new Error("Invalid `this.db.user.findUnique()` invocation ... Server selection timeout: No available servers ... (os error 10061)");
    expect(toErrorMessage(err, "Erreur lors de la connexion.")).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(toErrorMessage(new TypeError("Failed to fetch"), "Erreur.")).toBe(SERVICE_UNAVAILABLE_MESSAGE);
  });

  it("masque les bugs derrière le message de repli", () => {
    expect(toErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"), "Erreur lors du chargement.")).toBe("Erreur lors du chargement.");
    const prisma = Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), { name: "PrismaClientKnownRequestError" });
    expect(toErrorMessage(prisma, "Erreur lors de l'enregistrement.")).toBe("Erreur lors de l'enregistrement.");
  });
});
