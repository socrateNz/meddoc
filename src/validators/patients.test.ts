import { describe, it, expect } from "vitest";
import { createPatientSchema, createIncidentSchema } from "./patients";

describe("createPatientSchema", () => {
  const valid = {
    email: "patient@example.com",
    firstName: "Alice",
    lastName: "Dubois",
    dateOfBirth: "1945-05-15",
    address: "45 Rue de la Paix",
    dependencyLevel: 3,
    pathologies: ["Diabète"],
    allergies: [],
  };

  it("accepts a valid patient payload", () => {
    expect(createPatientSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = createPatientSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a dependency level out of range", () => {
    const result = createPatientSchema.safeParse({ ...valid, dependencyLevel: 9 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing address", () => {
    const { address, ...withoutAddress } = valid;
    const result = createPatientSchema.safeParse(withoutAddress);
    expect(result.success).toBe(false);
  });
});

describe("createIncidentSchema", () => {
  it("rejects a description that is too short", () => {
    const result = createIncidentSchema.safeParse({
      patientId: "p1",
      reportedById: "u1",
      title: "Chute",
      description: "ok",
      priority: "HIGH",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid incident payload", () => {
    const result = createIncidentSchema.safeParse({
      patientId: "p1",
      reportedById: "u1",
      title: "Chute dans la chambre",
      description: "Patient retrouvé au sol, conscient, pas de blessure apparente.",
      priority: "HIGH",
    });
    expect(result.success).toBe(true);
  });
});
