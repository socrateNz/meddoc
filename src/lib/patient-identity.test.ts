import { describe, it, expect } from "vitest";
import { displayPatientEmail, formatIpp, isTechnicalPatientEmail, technicalPatientEmail } from "./patient-identity";

describe("formatIpp", () => {
  it("formate l'IPP sur 6 chiffres, sans jamais tronquer au-delà", () => {
    expect(formatIpp(2026, 1248)).toBe("IPP-2026-001248");
    expect(formatIpp(2026, 1)).toBe("IPP-2026-000001");
    expect(formatIpp(2027, 1234567)).toBe("IPP-2027-1234567");
  });
});

describe("e-mail technique d'un patient sans e-mail", () => {
  it("est dérivé de l'IPP, reconnu, et jamais affiché", () => {
    const email = technicalPatientEmail("IPP-2026-001248");
    expect(email).toBe("ipp-2026-001248@patients.meddoc.local");
    expect(isTechnicalPatientEmail(email)).toBe(true);
    expect(displayPatientEmail(email)).toBe("");
  });

  it("laisse passer une vraie adresse", () => {
    expect(isTechnicalPatientEmail("awa@gmail.com")).toBe(false);
    expect(displayPatientEmail("awa@gmail.com")).toBe("awa@gmail.com");
    expect(displayPatientEmail(undefined)).toBe("");
  });
});
